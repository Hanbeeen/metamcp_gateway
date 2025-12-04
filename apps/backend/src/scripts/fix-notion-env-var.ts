
import { db } from "../db";
import { mcpServersTable } from "../db/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
    console.log("Fixing Notion Env Var...");

    const servers = await db.select().from(mcpServersTable);

    for (const server of servers) {
        if (server.name.toLowerCase().includes("notion")) {
            const env = server.env as Record<string, string>;
            if (env) {
                console.log(`Found server ${server.name}. Checking env vars...`);

                const newEnv = { ...env };
                let key = newEnv.NOTION_API_KEY || newEnv.API_KEY || newEnv.NOTION_TOKEN;

                if (key) {
                    console.log("Found key, ensuring both NOTION_API_KEY and NOTION_TOKEN are set.");
                    newEnv.NOTION_API_KEY = key;
                    newEnv.NOTION_TOKEN = key;
                    // Keep API_KEY just in case, or remove it if it causes issues? Let's keep it for now but ensure the others are set.
                    // Actually, let's remove API_KEY to be clean if we are sure.
                    if (newEnv.API_KEY) delete newEnv.API_KEY;

                    await db.update(mcpServersTable)
                        .set({ env: newEnv })
                        .where(eq(mcpServersTable.uuid, server.uuid));

                    console.log("Updated env vars.");
                } else {
                    console.log("No key found in env vars.");
                }
            } else {
                console.log(`Server ${server.name} does not need fixing.`);
                console.log(`Env keys: ${Object.keys(env || {})}`);
            }
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        // process.exit(0);
    });
