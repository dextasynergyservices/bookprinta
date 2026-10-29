# BookPrinta Malware Scanner (ClamAV on Oracle Cloud)

Every uploaded manuscript and bank receipt is scanned before it is stored
(CLAUDE.md constraint #6). This folder runs that scanner on **our own VM**, so
authors' files never go to a third party (the public VirusTotal API shares
submissions with its partners and is not licensed for commercial use).

```
API (Render) ──HTTPS + bearer token──▶ Caddy :443 ──▶ gateway :8080 ──▶ clamd :3310
                                       (this VM; only 80/443 are open to the internet)
```

| Part | What it does |
|---|---|
| `clamav` | ClamAV daemon. Keeps its virus database up to date by itself (freshclam). Needs ~1.2 GB RAM. |
| `gateway` | 100-line Node service (no dependencies): checks the token, streams the file into clamd, returns JSON. clamd has no auth, so it is never exposed directly. |
| `caddy` | HTTPS with free, auto-renewing Let's Encrypt certificates. |

Tested against ClamAV 1.5: clean files pass, the EICAR test file is detected,
oversize files (>15 MB) are refused, and a wrong token gets `401`.

---

## 1. Create the VM (Oracle Cloud Always Free)

1. Sign up at <https://www.oracle.com/cloud/free/> (a card is used for identity
   verification; Always Free resources are not charged).
2. **Recommended:** upgrade the account to **Pay As You Go**. You still pay
   nothing while you stay inside Always Free limits, but Oracle stops treating
   your instance as reclaimable when it is "idle" (Always Free instances with
   low CPU/memory use over 7 days can otherwise be stopped).
3. *Compute → Instances → Create instance*
   - **Image:** Canonical Ubuntu 24.04
   - **Shape:** `VM.Standard.A1.Flex` (Ampere, Always Free) — **1 OCPU, 6 GB RAM**
     is plenty. (The 1 GB `E2.1.Micro` shape is too small for ClamAV.)
   - **Networking:** default VCN, *assign a public IPv4 address*
   - **SSH keys:** upload your public key (or let Oracle generate one and save it)
   - If you get *"Out of capacity"*, try another Availability Domain or retry later.
4. *Networking → Reserved public IPs*: reserve the instance's IP so it never changes.

## 2. Open ports 80 and 443

**a. Oracle firewall** — *Networking → Virtual cloud networks → (your VCN) →
Security Lists → Default → Add Ingress Rules*:

| Source CIDR | Protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(Port 80 is needed only for Let's Encrypt to issue the certificate.)

**b. Ubuntu's own firewall** — Oracle images block ports by default. SSH in
(`ssh ubuntu@<IP>`) and run:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Point a domain at it

At your DNS provider, add an **A record**, e.g. `scan.bookprinta.com → <reserved IP>`.
Check with `nslookup scan.bookprinta.com` before continuing.

## 4. Install Docker and start the scanner

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker

# Copy this folder to the VM — from your computer:
#   scp -r infra/scanner ubuntu@<IP>:~/scanner
cd ~/scanner
cp .env.example .env
openssl rand -hex 32          # copy the output into SCANNER_TOKEN in .env
nano .env                     # set SCANNER_DOMAIN=scan.bookprinta.com and SCANNER_TOKEN=...

docker compose up -d --build
docker compose logs -f clamav # first boot downloads the virus DB (~3–5 min); wait for "clamd started"
```

## 5. Test it (on the VM or from your computer)

```bash
TOKEN=<your SCANNER_TOKEN>
URL=https://scan.bookprinta.com

curl -s $URL/health -H "Authorization: Bearer $TOKEN"
# {"ok":true}

echo "hello" | curl -s -X POST $URL/scan -H "Authorization: Bearer $TOKEN" --data-binary @-
# {"clean":true}

curl -s https://secure.eicar.org/eicar.com.txt | \
  curl -s -X POST $URL/scan -H "Authorization: Bearer $TOKEN" --data-binary @-
# {"clean":false,"signature":"Eicar-Test-Signature"}     ← the harmless standard test file

curl -s -o /dev/null -w "%{http_code}\n" $URL/health -H "Authorization: Bearer wrong"
# 401
```

(Run the EICAR test from the VM or a machine without antivirus — Windows
Defender will block the download on your PC, which is expected.)

## 6. Switch the API to it (Render → API service → Environment)

```
SCANNER_PROVIDER = clamav-http
SCANNER_URL      = https://scan.bookprinta.com
SCANNER_TOKEN    = <same value as on the VM>
```

Remove `VIRUSTOTAL_API_KEY`. After the redeploy the API log shows
`Scanner provider: remote ClamAV (scan.bookprinta.com)`. Upload a test
manuscript from the dashboard to confirm.

If the VM is down, uploads are **blocked** with "File scanning service is
temporarily unavailable" — never accepted unscanned.

---

## Maintenance

- **Virus definitions** update automatically inside the `clamav` container.
- **Monthly:** `cd ~/scanner && docker compose pull && docker compose up -d --build`
- **OS security updates:** `sudo apt install unattended-upgrades` (enabled by default on Ubuntu).
- **Rotate the token:** generate a new one, update `.env` on the VM
  (`docker compose up -d`) and `SCANNER_TOKEN` on Render at the same time.
- **Health from the API side:** `GET /api/v1/health/status` (with `HEALTH_STATUS_TOKEN`)
  reports whether the scanner is reachable.
