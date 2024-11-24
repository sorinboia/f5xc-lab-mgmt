#!/bin/bash
# Update the package list
sudo apt update

# Retrieve the account ID dynamically
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)

# Set the policy name and instance types to update 
POLICY_NAME="UDFUserPolicy"
INSTANCE_TYPES=("g4dn.xlarge")

# Save current policy to a file
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

DEFAULT_VERSION_ID=$(aws iam get-policy --policy-arn ${POLICY_ARN} --query 'Policy.DefaultVersionId' --output text)

aws iam get-policy-version \
    --policy-arn ${POLICY_ARN} \
    --version-id ${DEFAULT_VERSION_ID} \
    --query 'PolicyVersion.Document' \
    --output json > current_policy.json

# Convert array to a JSON array format for adding instance types
INSTANCE_TYPES_JSON=$(printf '%s\n' "${INSTANCE_TYPES[@]}" | jq -R . | jq -s .)

# Create a new version with the updated instance types
jq --argjson types "${INSTANCE_TYPES_JSON}" '.Statement[] |= if .Sid == "LimitEC2InstanceTypes" then
    .Condition."ForAnyValue:StringNotLike"."ec2:InstanceType" += $types
else . end' current_policy.json > updated_policy.json

# Create a new policy version
aws iam create-policy-version \
    --policy-arn ${POLICY_ARN} \
    --policy-document file://updated_policy.json \
    --set-as-default

# Clean up temporary files
rm current_policy.json updated_policy.json

echo "Policy has been updated to include the instance types: ${INSTANCE_TYPES[*]}"
