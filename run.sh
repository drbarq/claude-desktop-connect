#!/bin/bash
# Claude on Bedrock - Quick Start Script
#
# Usage:
#   ./run.sh                    # Uses AWS_PROFILE from environment
#   ./run.sh my-profile         # Uses specified profile
#   AWS_PROFILE=my-profile ./run.sh

set -e

# Use argument, or fall back to environment variable
PROFILE="${1:-$AWS_PROFILE}"
REGION="${AWS_REGION:-us-east-1}"

if [ -z "$PROFILE" ]; then
    echo "Usage: ./run.sh <aws-profile>"
    echo "   or: AWS_PROFILE=<profile> ./run.sh"
    echo ""
    echo "Available profiles:"
    grep '^\[profile' ~/.aws/config 2>/dev/null | sed 's/\[profile /  /g; s/\]//g' || echo "  (none found in ~/.aws/config)"
    exit 1
fi

echo "Using AWS Profile: $PROFILE"
echo "Using AWS Region:  $REGION"
echo ""

# Login via SSO (if needed)
echo "Checking AWS credentials..."
if ! AWS_PROFILE="$PROFILE" aws sts get-caller-identity &>/dev/null; then
    echo "Credentials expired or not found. Logging in..."
    aws sso login --profile "$PROFILE"
fi

echo "Credentials valid!"
echo ""

# Launch the chat
echo "Starting Claude on Bedrock..."
AWS_PROFILE="$PROFILE" AWS_REGION="$REGION" streamlit run bedrock_chat.py
