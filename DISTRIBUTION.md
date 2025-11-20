# Distribution and Installation Guide

This guide explains how to build, distribute, and install your Notes List Electron app.

## Built Files

Your app has been successfully built! Check the `dist/` folder:

```bash
ls -lh dist/
```

You'll find:
- `Notes List-0.1.0-arm64.dmg` - macOS installer (551 MB)
- `Notes List-0.1.0-arm64-mac.zip` - macOS portable app (533 MB)
- `*.blockmap` files - Used for auto-updates (delta downloads)
- `latest-mac.yml` - Update metadata file

## Installation

### On macOS

1. Open the `.dmg` file
2. Right-click on "Notes List.app" → **Open** (required for unsigned apps)
3. Click "Open" in the security dialog
4. The app will launch!

Or install via ZIP:
1. Extract the `.zip` file
2. Move "Notes List.app" to Applications
3. Right-click → Open (first time only)

### Security Warning

Since the app is **not code-signed**, macOS will show a security warning on first launch. Users need to:
1. Right-click the app → **Open** (don't double-click!)
2. Click "Open" in the dialog

## Building for Distribution

### Build for your current platform (macOS):
```bash
npm run electron:build:mac
```

### Build for all platforms:
```bash
npm run electron:build        # Builds macOS, Windows, Linux
npm run electron:build:win    # Windows only
npm run electron:build:linux  # Linux only
```

## Distribution Methods

### 1. GitHub Releases (Recommended)

A GitHub Actions workflow has been set up to automatically build and publish releases.

#### To create a new release:

1. **Update version in package.json:**
   ```json
   {
     "version": "0.2.0"
   }
   ```

2. **Commit and tag:**
   ```bash
   git add package.json
   git commit -m "Release v0.2.0"
   git tag v0.2.0
   git push origin main --tags
   ```

3. **GitHub Actions will automatically:**
   - Build for macOS, Windows, and Linux
   - Create a GitHub Release
   - Upload all installer files
   - Generate release notes

4. **Users can download from:**
   ```
   https://github.com/dvdqrng/v0-intelligent-todo-app/releases
   ```

### 2. Direct Distribution

You can also distribute the files directly:
- Upload to your website
- Share via cloud storage (Dropbox, Google Drive)
- Email to users (though files are large ~500MB)

## Auto-Updates

Auto-updates are fully configured!

### How it works:

1. When you publish a new release on GitHub, the app will automatically detect it
2. Users will see an update notification in the bottom-right corner
3. They can download and install the update with one click
4. The app uses delta downloads (only downloads changed parts) to save bandwidth

### To enable auto-updates in your UI:

Add the `UpdateNotifier` component to your main layout:

```tsx
import { UpdateNotifier } from '@/components/update-notifier';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <UpdateNotifier />
      </body>
    </html>
  );
}
```

### Update behavior:

- **Automatic check**: App checks for updates 3 seconds after launch (production only)
- **Manual check**: Users can manually trigger via `window.electronDB.checkForUpdates()`
- **Download**: Updates download in the background
- **Install**: Updates install when the app quits

## File Sizes

The app is ~500-550 MB because it includes:
- Electron runtime
- Chromium engine
- Node.js
- Your app code and dependencies
- SQLite database

This is normal for Electron apps.

## Platform Support

Your build configuration supports:

| Platform | Formats | Notes |
|----------|---------|-------|
| **macOS** | DMG, ZIP | ARM64 (Apple Silicon) + x64 via Rosetta |
| **Windows** | NSIS Installer, Portable EXE | 64-bit only |
| **Linux** | AppImage, DEB | Universal and Debian-based |

## Code Signing (Future Enhancement)

To remove security warnings, you'll need to code-sign:

### macOS:
- Apple Developer account ($99/year)
- Developer ID certificate
- Notarization with Apple

### Windows:
- Code signing certificate ($200-400/year)
- Sign with `signtool`

## Testing

To test the built app locally:

```bash
# Open the DMG
open "dist/Notes List-0.1.0-arm64.dmg"

# Or run the app directly
open "dist/mac-arm64/Notes List.app"
```

## Troubleshooting

### "App is damaged" error on macOS
This happens with unsigned apps. Solution:
```bash
xattr -cr "dist/mac-arm64/Notes List.app"
```

### Updates not working
- Ensure you've tagged and pushed a release to GitHub
- Check that the `publish` config in `package.json` is correct
- Verify the app version is lower than the release version

### Build fails
- Run `npm install` to ensure all dependencies are installed
- Check that `out/` directory exists after `next build`
- Verify `electron/main.js` and `electron/preload.js` exist

## Next Steps

1. **Add the UpdateNotifier** to your main layout to show update notifications
2. **Create your first release** by tagging and pushing to GitHub
3. **Share the release URL** with your users
4. **Consider code signing** if you want to remove security warnings

## Support

For issues or questions:
- Check the GitHub Actions workflow logs
- Review the `builder-debug.yml` file in the `dist/` folder
- Test locally before publishing releases
