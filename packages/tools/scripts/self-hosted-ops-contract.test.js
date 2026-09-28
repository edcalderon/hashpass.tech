const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const planeComposePath = path.join(root, 'ops/self-hosted/plane/compose.yaml');
const backupScriptPath = path.join(root, 'ops/self-hosted/backups/backup.sh');

describe('self-hosted Plane storage upgrade contract', () => {
  it('accepts legacy AWS storage credentials when the renamed variables are absent', () => {
    const compose = fs.readFileSync(planeComposePath, 'utf8');
    const backup = fs.readFileSync(backupScriptPath, 'utf8');

    expect(compose).toContain('${OBJECT_STORAGE_ACCESS_KEY_ID:-${AWS_ACCESS_KEY_ID:-}}');
    expect(compose).toContain('${OBJECT_STORAGE_SECRET_ACCESS_KEY:-${AWS_SECRET_ACCESS_KEY:-}}');
    expect(backup).toContain('BACKUP_S3_ACCESS_KEY_ID:-${AWS_ACCESS_KEY_ID:-}');
    expect(backup).toContain('BACKUP_S3_SECRET_ACCESS_KEY:-${AWS_SECRET_ACCESS_KEY:-}');
  });

  it('keeps MinIO supervised and initializes its bucket in a one-shot service', () => {
    const compose = fs.readFileSync(planeComposePath, 'utf8');

    expect(compose).toContain('plane-minio-init:');
    expect(compose).toMatch(/plane-minio-init:[\s\S]*?image: minio\/mc:RELEASE\.2025-08-13T08-35-41Z/);
    expect(compose).toContain('command: ["server", "/export", "--console-address", ":9090"]');
    expect(compose).toContain('condition: service_completed_successfully');
    expect(compose).not.toContain('tail -f /dev/null');
    expect(compose).not.toContain('minio server /export --console-address');
  });
});
