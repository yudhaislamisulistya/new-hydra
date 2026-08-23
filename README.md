# New Hydra local stack

Production does not depend on Supabase Cloud. The static Next.js frontend,
GoTrue authentication, PostgREST API, and PostgreSQL database run on this
server. The Supabase JavaScript package is only a browser client for the local
GoTrue and PostgREST protocols; its base URL is https://hydra.sivia.id.

## Services

| Container | Purpose | Host port |
| --- | --- | --- |
| hydra_frontend | Nginx and static frontend | 7108 |
| hydra_postgrest_api | Local REST and RPC API | 8107 |
| hydra_postgres_db | PostgreSQL 15 | 5451 |
| hydra_auth | GoTrue authentication | internal |

Nginx routes /auth/v1 to GoTrue and /rest/v1 to PostgREST.

## Deploy and verify

    docker volume create new-hydra_hydra_postgres_local_data
    docker compose config --quiet
    docker compose up -d --build
    docker compose ps

The database volume is external so docker compose down -v cannot delete it.
Initialization scripts only run when this volume is empty. They restore Auth
users, public data, local RPC functions, and RLS policies.

Health checks:

    curl -fsS http://127.0.0.1:7108/
    curl -fsS http://127.0.0.1:7108/auth/v1/health
    curl -fsS 'http://127.0.0.1:7108/rest/v1/schools?select=id&limit=1'

database/auth-data.sql contains password hashes and is excluded from Git.
The pre-migration volume new-hydra_hydra_postgres_data and a validated backup
in /home/new-hydra-backups are retained for rollback. Do not delete them until
the local deployment has completed its retention period.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
