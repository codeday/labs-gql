import "dotenv/config";

const endpoint = process.env.GRAPHQL_ENDPOINT || "http://localhost:5000/graphql";
const apiKey = process.env.API_KEY; // Bearer token (labs JWT) if you want the authed queries to run

const publicQueries: Array<{ name: string; query: string; variables?: Record<string, unknown> }> = [
  {
    name: "statTotalOutcomes",
    query: `
      query StatTotalOutcomes {
        statTotalOutcomes {
          key
          value
        }
      }
    `,
  },
];

// These require a Bearer token (admin/manager/etc.)
const authedQueries: Array<{ name: string; query: string; variables?: Record<string, unknown> }> = [
  {
    name: "mentors",
    query: `
      query Mentors {
        mentors(take: 5) {
          id
          email
          givenName
          surname
          status
          eventId
        }
      }
    `,
  },
  {
    name: "students",
    query: `
      query Students {
        students(take: 5) {
          id
          email
          givenName
          surname
          track
          status
          eventId
        }
      }
    `,
  },
  {
    name: "projects",
    query:`
      query Projects {
        projects(take: 5) {
          id
          description
          track
          status
          eventId
        }
      }
    `,
  },
];

async function run() {
  console.log(`Using endpoint: ${endpoint}`);

  for (const { name, query, variables } of publicQueries) {
    await exec(name, query, variables, false);
  }

  if (!apiKey) {
    console.log("\n(No API_KEY provided; skipping authed queries.)");
  } else {
    for (const { name, query, variables } of authedQueries) {
      await exec(name, query, variables, true);
    }
  }
}

async function exec(name: string, query: string, variables: Record<string, unknown> | undefined, useAuth: boolean) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(useAuth && apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = await res.json();
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error(`\n=== ${name} FAILED ===`);
    console.error(err);
  }
}

run();
