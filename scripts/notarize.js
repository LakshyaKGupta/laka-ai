/* Runs only for signed macOS release builds when notarization secrets are supplied. */
const { notarize } = require('@electron/notarize');

exports.default = async function notarizeRelease(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    console.log('[notarize] skipped: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID are required for a release.');
    return;
  }
  await notarize({
    appBundleId: packager.appInfo.id,
    appPath: `${appOutDir}/${packager.appInfo.productFilename}.app`,
    appleId,
    appleIdPassword,
    teamId
  });
};
