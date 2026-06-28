# Play Console Release Flow

This guide covers the Play Console track ladder for HashPass and how it maps to the repo's Android release workflow.

Temporary release posture: the current cycle is internal-first on the development profile. Use `environment=development` for validation, keep alpha gated by the matching internal release on the same tag, and do not publish to production until the release freeze is lifted.

## Track Matrix

| Track | Play Console purpose | Repo command | Release status | When to use |
|------|----------------------|--------------|----------------|-------------|
| Internal | Early QA for trusted testers | `environment=development` | `completed` | Required first step before closed alpha or when you want the fastest smoke test |
| Closed (`alpha`) | Controlled pre-launch testing | `environment=development --track=alpha` | `draft` for the first upload, then `completed` | Follow the internal track for the same tag before broader pre-launch testing while production is paused |
| Open (`beta`) | Broader public testing | `environment=production --track=beta` | `completed` | After production access is granted and you want wider feedback |
| Production | Public release | `environment=production --track=production` | `completed` | Paused until the release freeze is lifted |

Notes:

- The workflow uses Play API track names (`internal`, `alpha`, `beta`, `production`).
- In the Play Console UI, open testing maps to the `beta` track.
- `release_status=draft` is only needed for the first closed-testing upload while Play still treats the app as draft.
- `release_status=completed` is the default for normal releases.
- Closed alpha is blocked until the matching internal release has already succeeded for the same tag.
- Production publishing is paused for the current development cycle; do not use the production track until the hold is lifted.
- Expo prebuild enables Android release minification, so Gradle emits a `mapping.txt` file for release builds.
- The Fastlane release lane uploads any available Play deobfuscation files from the Android build outputs, so Play Console crash traces stay readable when `mapping.txt` or `native-debug-symbols.zip` exists.
- This only applies to builds created after this change; already-uploaded draft artifacts will stay without deobfuscation until a new build is uploaded.

## 1. Internal Testing

Use internal testing for the quickest possible distribution to a small group of trusted testers.

Why it exists:

- Fastest way to validate a build before broader release.
- Can be used before the app is fully configured.
- Supports up to 100 testers.
- It is the required first release before any closed alpha upload on the same tag.

How to release from this repo:

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=development \
  --field auto_promote_alpha=true \
  --field backend=fastlane \
  --field runner=aws-ec2
```

What to do in Play Console:

1. Go to `Testing > Internal testing`.
2. Create or open the internal track.
3. Add testers by email or Google Group.
4. Create the release and upload the AAB.
5. Review warnings, save, and roll out.

If you want the workflow to auto-dispatch alpha after internal, add `auto_promote_alpha=true`. If the first closed-test upload still needs to be a draft, also set `alpha_release_status=draft` on the internal dispatch.

What to verify:

- Sign-in and sign-out.
- Navigation between the main app areas.
- QR scanning if the app build includes it.
- Crash-free launch on a real device.

## 2. Closed Testing

Closed testing is the current second step after internal and remains the pre-production gate for newly created personal developer accounts.

Google's current guidance for newly created personal developer accounts is:

- At least 12 testers must be opted in.
- They must remain opted in continuously for 14 days before you can apply for production access.

How to release the first closed test from this repo:

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=development \
  --field track=alpha \
  --field release_status=draft \
  --field backend=fastlane \
  --field runner=aws-ec2
```

For subsequent alpha updates, switch `release_status` back to `completed` once Play no longer treats the app as draft.
If you use `auto_promote_alpha=true` on the internal run, the workflow will dispatch this alpha step automatically for the same tag.

If the internal release has not already succeeded for the same tag, run the internal workflow first and wait for it to complete before dispatching alpha.

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

Open testing is broader pre-production testing and is only available after production access. It is not part of the current release freeze.

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

## 4. Production (Paused)

Production is the public release path and is paused for the current development cycle.

Before publishing, make sure:

- The closed test requirement is satisfied.
- Production access has been approved in Play Console.
- Store listing, Data Safety, content rating, app access, and signing are complete.
- You have a release note summary ready for users and reviewers.

How to publish from this repo when the freeze lifts:

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

## Baseline Production Checklist

Use this checklist when moving from the current closed-test baseline to the live production release.

This checklist is deferred until production access has been approved and the release freeze lifts.

1. Confirm the alpha closed test is still active, has at least 12 opted-in testers, and those testers have remained opted in for 14 continuous days.
2. Confirm production access has been approved in Play Console and that Store listing, Data Safety, content rating, app access, and signing are all complete.
3. Cut the next patch version from `main` with `npm run release:patch`. Do not reuse the last shipped tag for production.
4. Trigger `mobile-android-release.yml` on the new tag with `environment=production`, `track=production`, `release_status=completed`, `backend=fastlane`, and `runner=aws-ec2`.
5. In Play Console, add production release notes, pick a staged rollout percentage, and start the rollout.
6. Verify the workflow run, the web deploy checks, and Android Vitals after rollout begins.
7. If the rollout shows crashes, policy issues, or a bad store listing, halt it and cut the next patch before expanding further.

## Recommended Path

1. Start with internal testing. The workflow now blocks `alpha` until internal succeeds for the same tag.
2. Run a closed test on `alpha` after the internal release is live.
3. Keep testers opted in for 14 days and apply for production access when you are ready.
4. Use open testing only if you want a broader pre-production audience after access is granted.
5. Publish to production only after the freeze lifts.

## Related Docs

- [RELEASE_WORKFLOW.md](./RELEASE_WORKFLOW.md)
- [README.md](../../README.md)
- [Google Play test track help](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en)
- [Google Play production access help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
