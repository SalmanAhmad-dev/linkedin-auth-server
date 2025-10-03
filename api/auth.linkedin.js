import axios from "axios";
import admin from "firebase-admin";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

export default async function handler(req, res) {
  const { query } = req;

  // Step 1: If no "code" param, redirect to LinkedIn login
  if (!query.code) {
    const redirectUri = process.env.REDIRECT_URI;
    const clientId = process.env.LINKEDIN_CLIENT_ID;

    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=profile%20email`;

    return res.redirect(url);
  }

  // Step 2: LinkedIn callback with "code"
  try {
    const tokenRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      null,
      {
        params: {
          grant_type: "authorization_code",
          code: query.code,
          redirect_uri: process.env.REDIRECT_URI,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        },
      }
    );

    const accessToken = tokenRes.data.access_token;

    // Fetch user profile
    const profileRes = await axios.get("https://api.linkedin.com/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Fetch user email
    const emailRes = await axios.get(
      "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const linkedInId = profileRes.data.id;
    const email = emailRes.data.elements[0]["handle~"].emailAddress;

    // Create Firebase custom token
    const firebaseToken = await admin.auth().createCustomToken(linkedInId, {
      email,
    });

    // Return Firebase token to frontend
    res.send(`
      <script>
        window.opener.postMessage({firebaseToken: "${firebaseToken}"}, "*");
        window.close();
      </script>
    `);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Error logging in with LinkedIn");
  }
}
