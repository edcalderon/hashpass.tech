# HashPass

## Reinventing Event Tickets for a Smarter Future

At **HashPass**, we’re reinventing how event tickets work by transforming them into secure, smart digital passes powered by blockchain. These passes go far beyond entry—they enable loyalty programs, real-time access control, and post-event engagement, all in a single super-app.

---

## 🚀 Our Open Source Mission

HashPass is committed to building a better, fairer, and more innovative event experience for everyone. By making our platform open source, we empower communities, creators, and organizations to:

- **Trust the Process:** Blockchain-backed tickets ensure authenticity and transparency.
- **Own Their Experience:** Event organizers and attendees have full control over their digital passes and data.
- **Collaborate & Innovate:** Anyone can contribute, customize, and extend HashPass to fit unique needs.

We believe in a future where event access is frictionless, secure, and rewarding—for everyone.

---

## ✨ Key Features

- **Blockchain-Powered Security:** Eliminate fraud and scalping with verifiable, tamper-proof tickets.
- **Smart Digital Passes:** Tickets are more than just entry—they unlock loyalty rewards, discounts, and exclusive content.
- **Real-Time Access Control:** Manage entry, re-entry, and VIP privileges instantly and securely.
- **Post-Event Engagement:** Keep the conversation going with post-event content, offers, and community features.
- **Open API & Extensible:** Build your own integrations or contribute new features to the core platform.

---

## 🌍 Why Open Source?

We believe the future of events should be shaped by the community. By making HashPass open source, we:

- **Foster Transparency:** Anyone can inspect, audit, and improve the code.
- **Encourage Collaboration:** Developers, event organizers, and users can propose features, report issues, and submit improvements.
- **Support Innovation:** Open code means anyone can build new tools, integrations, and experiences on top of HashPass.

---

## 🛠️ Getting Started

1. **Clone the repo:**
   ```bash
   git clone https://github.com/edcalderon/hashpass.tech.git
   cd hashpass.tech
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Run the development server:**
   ```bash
   npm run dev
   ```
4. **Start building!**

### BSLatam 2025 Matchmaking Sandbox

Routes (web):
- `/bslatam/home` — listado de speakers y búsqueda
- `/bslatam/speakers/[id]` — perfil de speaker y disponibilidad
- `/bslatam/speakers/calendar?speakerId=...&day=YYYY-MM-DD` — selector de slots
- `/bslatam/my-bookings` — reservas del asistente
- `/bslatam/speaker-dashboard` — panel de solicitudes del speaker

API endpoints:
- `GET /api/bslatam/speakers`
- `GET /api/bslatam/speakers/:id`
- `POST /api/bslatam/bookings` { speakerId, attendeeId, start, end }
- `PATCH /api/bslatam/bookings/:id` { status }
- `GET /api/bslatam/bookings?user=:id`
- `POST /api/bslatam/verify-ticket` { ticketId, userId }

Database (Supabase/Postgres): see migration `supabase/migrations/20251014090000_bslatam_matchmaking.sql`.

Seeding speakers:
```bash
export EXPO_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
npm run seed:bslatam
```

Env vars (email via SES / Nodemailer):
- `NODEMAILER_HOST` - SMTP server hostname
- `NODEMAILER_PORT` - SMTP server port (usually 587)
- `NODEMAILER_USER` - SMTP authentication username
- `NODEMAILER_PASS` - SMTP authentication password
- `NODEMAILER_FROM` - Email address to send from (e.g., no-reply@hashpass.tech)
- `NODEMAILER_FROM_SUPPORT` - Support email address shown in email footers (defaults to support@hashpass.tech if not set)

For a complete list of all environment variables, see [docs/environment-variables.md](docs/environment-variables.md).

Deploy:
```bash
chmod +x ./deploy-bslatam.sh
./deploy-bslatam.sh
```
For Amplify: configure AWS credentials and run `amplify publish`.

---

## 🤝 Contributing

We welcome contributions of all kinds! Whether you’re fixing bugs, adding features, or improving documentation, your input makes HashPass better for everyone.

- Check out our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines
- Open an issue or pull request on GitHub
- Join the discussion and share your ideas

---

## 📣 Connect With Us

- [GitHub Issues](https://github.com/edcalderon/hashpass.tech/issues)
- [Discussions](https://github.com/edcalderon/hashpass.tech/discussions)
- [Twitter](https://twitter.com/hashpass.tech)

---

## 📄 License

HashPass is open source under the [MIT License](LICENSE).

---

Together, let’s build the future of event access—secure, smart, and open to all.
