// AWS Configuration
// Note: These credentials are for testing purposes only
// In production, use environment variables and proper authentication methods

const AWS_CONFIG = {
    accessKeyId: "AKIA276CMBVE77VJTOQC",
    secretAccessKey: "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",
    region: "eu-north-1",
    bucketName: "3dmodle"
};

// Initialize AWS SDK with the configuration
if (typeof AWS !== 'undefined') {
    AWS.config.update({
        accessKeyId: AWS_CONFIG.accessKeyId,
        secretAccessKey: AWS_CONFIG.secretAccessKey,
        region: AWS_CONFIG.region
    });
}
