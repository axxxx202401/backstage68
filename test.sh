```bash
#!/bin/bash

GATEWAY=$(route -n get default 2>/dev/null | grep gateway | awk '{print $2}')

DOMAINS=(
  "cursor.com"
  "api2.cursor.sh"
  "cursor.sh"
  "anthropic.com"
  "api.anthropic.com"
  "claude.ai"
  "openai.com"
  "api.openai.com"
  "oaistatic.com"
  "googleapis.com"
  "generativelanguage.googleapis.com"
)

for domain in "${DOMAINS[@]}"
do
  echo "Processing $domain"

  IPS=$(dig +short $domain | grep -E '^[0-9.]+' )

  for ip in $IPS
  do
    echo "Adding route for $ip"
    sudo route -n add $ip $GATEWAY
  done
done
```
