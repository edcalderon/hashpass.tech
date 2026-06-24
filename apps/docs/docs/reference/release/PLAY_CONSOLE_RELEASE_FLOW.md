# Play Console Release Flow

This guide covers the Play Console track ladder for HashPass and how it maps to the repo's Android release workflow.

## Track Matrix

| Track | Play Console purpose | Repo command | Release status | When to use |
|------|----------------------|--------------|----------------|-------------|
| Internal | Early QA for trusted testers | `environment=development` | `completed` | Before the app is fully configured or when you want the fastest smoke test |
| Closed (`alpha`) | Controlled pre-launch testing | `environment=production --track=alpha` | `draft` for the first upload, then `completed` | Required gate before production access for new personal developer accounts |
| Open (`beta`) | Broader public testing | `environment=production --track=beta` | `completed` | After production access is granted and you want wider feedback |
| Production | Public release | `environment=production --track=production` | `completed` | For the live app release and staged rollouts |

Notes:

- The workflow uses Play API track names (`internal`, `alpha`, `beta`, `production`).
- In the Play Console UI, open testing maps to the `beta` track.
- `release_status=draft` is only needed for the first closed-testing upload while Play still treats the app as draft.
- `release_status=completed` is the default for normal releases.
- Expo prebuild enables Android release minification, so Gradle emits a `mapping.txt` file for release builds.
- The Fastlane release lane uploads any available Play deobfuscation files from the Android build outputs, so Play Console crash traces stay readable when `mapping.txt` or `native-debug-symbols.zip` exists.
- This only applies to builds created after this change; the already-uploaded `v1.8.135` draft artifact will stay without deobfuscation until a new build is uploaded.

## 1. Internal Testing

Use internal testing for the quickest possible distribution to a small group of trusted testers.

Why it exists:

- Fastest way to validate a build before broader release.
- Can be used before the app is fully configured.
- Supports up to 100 testers.

How to release from this repo:

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=development \
  --field backend=fastlane \
  --field runner=aws-ec2
```

What to do in Play Console:

1. Go to `Testing > Internal testing`.
2. Create or open the internal track.
3. Add testers by email or Google Group.
4. Create the release and upload the AAB.
5. Review warnings, save, and roll out.

What to verify:

- Sign-in and sign-out.
- Navigation between the main app areas.
- QR scanning if the app build includes it.
- Crash-free launch on a real device.

## 2. Closed Testing

Closed testing is the required pre-production gate for newly created personal developer accounts.

Google's current guidance for newly created personal developer accounts is:

- At least 12 testers must be opted in.
- They must remain opted in continuously for 14 days before you can apply for production access.

How to release the first closed test from this repo:

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=production \
  --field track=alpha \
  --field release_status=draft \
  --field backend=fastlane \
  --field runner=aws-ec2
```

For subsequent alpha updates, switch `release_status` back to `completed` once Play no longer treats the app as draft.

What to do in Play Console:

1. Go to `Testing > Closed testing`.
2. Create or manage the `alpha` track.
3. Add the tester list.
4. Upload the AAB and add release notes.
5. Save and roll out the release.

If the track list shows a version with `Draft`, the release already exists but has not been rolled out yet. In that case:

1. Click `Manage track` on the existing closed track you want to use.
2. Open the `Releases` tab and select the draft release.
3. Click `Edit release`, review the summary, then click `Next`.
4. Resolve any errors, then click `Start rollout`.
5. Use `Create track` only if you need an additional closed track, not for the existing one.

If the track list says `There is no release on this track`, the track exists but is still empty. Use `Manage track` to create the first release on that track.

What to verify:

- The tester opt-in link works.
- The testers can install the release from Play.
- Google Sign-In works on real devices.
- Android Vitals stay clean long enough to trust the build.

## 3. Open Testing

Open testing is broader pre-production testing and is only available after production access.

Use it when you want a larger audience to see the test listing and provide private feedback.

How to release from this repo:

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=production \
  --field track=beta \
  --field release_status=completed \
  --field backend=fastlane \
  --field runner=aws-ec2
```

What to do in Play Console:

1. Go to `Testing > Open testing`.
2. Create or manage the `beta` track.
3. Publish the release.
4. Share the join link or make the listing discoverable, depending on your rollout plan.

What to verify:

- The store listing is ready to be visible to a wider audience.
- Feedback is arriving through Play.
- The release is stable enough to justify widening the audience.

## 4. Production

Production is the public release path.

Before publishing, make sure:

- The closed test requirement is satisfied.
- Production access has been approved in Play Console.
- Store listing, Data Safety, content rating, app access, and signing are complete.
- You have a release note summary ready for users and reviewers.

How to publish from this repo:

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=production \
  --field track=production \
  --field release_status=completed \
  --field backend=fastlane \
  --field runner=aws-ec2
```

What to do in Play Console:

1. Go to `Test and release > Production`.
2. Create a new release.
3. Upload the AAB.
4. Add production release notes.
5. Review warnings and policy checks.
6. Choose a staged rollout percentage or go to 100% if you are ready.
7. Start the rollout.

After rollout:

- Watch Android Vitals, crash reports, and user feedback.
- If something is wrong, halt the rollout or ship a fix before expanding further.
- Keep the next patch ready so you can respond quickly.

## v1.8.135 Baseline Production Checklist

Use this checklist when moving from the current closed-test baseline to the live production release.

1. Confirm the alpha closed test is still active, has at least 12 opted-in testers, and those testers have remained opted in for 14 continuous days.
2. Confirm production access has been approved in Play Console and that Store listing, Data Safety, content rating, app access, and signing are all complete.
3. Cut the next patch version from `main` with `npm run release:patch`. Do not reuse `v1.8.135` for production.
4. Trigger `mobile-android-release.yml` on the new tag with `environment=production`, `track=production`, `release_status=completed`, `backend=fastlane`, and `runner=aws-ec2`.
5. In Play Console, add production release notes, pick a staged rollout percentage, and start the rollout.
6. Verify the workflow run, the web deploy checks, and Android Vitals after rollout begins.
7. If the rollout shows crashes, policy issues, or a bad store listing, halt it and cut the next patch before expanding further.

## Recommended Path

1. Start with internal testing if you need the fastest QA loop.
2. Run a closed test on `alpha`.
3. Keep testers opted in for 14 days and apply for production access.
4. Use open testing only if you want a broader pre-production audience after access is granted.
5. Publish to production on `track=production`.

## Related Docs

- [RELEASE_WORKFLOW.md](./RELEASE_WORKFLOW.md)
- [README.md](../../README.md)
- [Google Play test track help](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en)
- [Google Play production access help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
