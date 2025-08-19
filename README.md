# Plateforme - LinkedIn OAuth Integration

This project provides a LinkedIn OAuth integration that allows users to connect their LinkedIn accounts and optionally sync with Unipile.

## 🚀 Features

- **LinkedIn OAuth Flow**: Secure authentication with LinkedIn
- **User Profile Retrieval**: Get user's LinkedIn profile information
- **Unipile Integration**: Optional integration with Unipile platform
- **Modern UI**: Beautiful, responsive interface
- **Webhook Support**: Ready for automation workflows

## 📋 Prerequisites

1. **LinkedIn Developer Account**
2. **Node.js** (v16 or higher)
3. **npm** or **yarn**

## 🔧 Setup Instructions

### 1. LinkedIn App Configuration

1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Click **"Create App"**
3. Fill in the app details:
   - **App Name**: Your app name
   - **LinkedIn Page**: Your company page
   - **App Logo**: Upload your logo
4. Go to **"Auth"** tab
5. Add **Redirect URLs**:
   - `http://localhost:3000/linkedin/callback` (for development)
   - `https://yourdomain.com/linkedin/callback` (for production)
6. Copy your **Client ID** and **Client Secret**

### 2. Environment Configuration

Create or update your `env.local` file:

```bash
# LinkedIn OAuth credentials
LINKEDIN_CLIENT_ID=your_linkedin_client_id_here
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret_here

# Unipile credentials (optional)
UNIPILE_DSN=your_unipile_dsn
UNIPILE_API_KEY=your_unipile_api_key

# App configuration
BASE_URL=http://localhost:3000
SUCCESS_URL=http://localhost:3000/success
FAILURE_URL=http://localhost:3000/failure
PORT=3000
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## 🔄 How It Works

### OAuth Flow

1. **User clicks "Connect LinkedIn"**
2. **Redirect to LinkedIn**: User is redirected to LinkedIn's OAuth page
3. **User authorizes**: User enters credentials and grants permissions
4. **Callback handling**: LinkedIn redirects back with authorization code
5. **Token exchange**: Server exchanges code for access token
6. **Profile retrieval**: Server fetches user's LinkedIn profile
7. **Success redirect**: User is redirected to success page

### API Endpoints

- `GET /connect/linkedin` - Initiates LinkedIn OAuth flow
- `GET /linkedin/callback` - Handles OAuth callback
- `GET /success` - Success page after connection
- `GET /failure` - Failure page if OAuth fails

## 🛡️ Security Features

- **HTTPS required** for production
- **State parameter** for OAuth security
- **Secure token storage** (in-memory for demo, use database for production)
- **CORS protection** enabled

## 🚀 Production Deployment

### Vercel Deployment

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **Set environment variables** in Vercel dashboard

### Environment Variables for Production

```bash
BASE_URL=https://yourdomain.com
SUCCESS_URL=https://yourdomain.com/success
FAILURE_URL=https://yourdomain.com/failure
LINKEDIN_CLIENT_ID=your_production_client_id
LINKEDIN_CLIENT_SECRET=your_production_client_secret
```

## 🔧 Customization

### Adding More Providers

To add other social platforms:

1. **Create OAuth endpoints** similar to LinkedIn
2. **Update environment variables** with new credentials
3. **Modify success page** to handle multiple providers
4. **Add provider-specific logic** in callback handlers

### Database Integration

For production use, consider:

- **User management system**
- **Connection storage** (database instead of in-memory)
- **Token refresh handling**
- **Webhook event storage**

## 📱 API Usage

### Connect LinkedIn Account

```bash
curl -X GET http://localhost:3000/connect/linkedin
```

### Check Connection Status

```bash
curl -X GET http://localhost:3000/test-unipile
```

## 🐛 Troubleshooting

### Common Issues

1. **"LinkedIn OAuth not configured"**
   - Check `LINKEDIN_CLIENT_ID` in environment variables

2. **"Invalid redirect URI"**
   - Verify redirect URL in LinkedIn app settings matches your callback URL

3. **"Access denied"**
   - Check LinkedIn app permissions and scopes

4. **"Cannot find module 'axios'"**
   - Run `npm install` to install dependencies

### Debug Mode

Enable detailed logging by checking server console output.

## 📄 License

This project is licensed under the ISC License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review LinkedIn Developer documentation
- Open an issue in this repository

---

**Note**: This is a demonstration project. For production use, implement proper security measures, database storage, and error handling.
