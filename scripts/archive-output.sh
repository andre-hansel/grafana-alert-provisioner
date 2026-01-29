#!/bin/bash
# Archive generated alert scripts and validation reports to documentation folder
#
# Usage: ./scripts/archive-output.sh [customer-name]
# Example: ./scripts/archive-output.sh spacelift

set -e

CUSTOMER="${1:-}"
OUTPUT_DIR="alert_deployer/output"
DOCS_DIR="docs/deployments"

if [ -z "$CUSTOMER" ]; then
  echo "Usage: $0 <customer-name>"
  echo "Example: $0 spacelift"
  exit 1
fi

# Create docs directory if it doesn't exist
mkdir -p "$DOCS_DIR/$CUSTOMER"

# Find and move files matching the customer name (case-insensitive)
shopt -s nocaseglob

MOVED=0

# Move alert scripts
for f in "$OUTPUT_DIR"/*"$CUSTOMER"*.ts; do
  if [ -f "$f" ]; then
    mv "$f" "$DOCS_DIR/$CUSTOMER/"
    echo "Moved: $(basename "$f")"
    ((MOVED++))
  fi
done

# Move validation reports
for f in "$OUTPUT_DIR"/*"$CUSTOMER"*.md; do
  if [ -f "$f" ]; then
    mv "$f" "$DOCS_DIR/$CUSTOMER/"
    echo "Moved: $(basename "$f")"
    ((MOVED++))
  fi
done

shopt -u nocaseglob

if [ "$MOVED" -eq 0 ]; then
  echo "No files found matching '$CUSTOMER' in $OUTPUT_DIR"
  exit 1
fi

echo ""
echo "Archived $MOVED file(s) to $DOCS_DIR/$CUSTOMER/"
ls -la "$DOCS_DIR/$CUSTOMER/"
