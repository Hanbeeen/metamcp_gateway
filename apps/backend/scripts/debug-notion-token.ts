
import { db } from "../src/db";
import { mcpServersTable, oauthSessionsTable } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
    console.log("Checking MCP Servers for Notion configuration...");

    const servers = await db.select().from(mcpServersTable);

    console.log(`Found ${servers.length} servers.`);

    for (const server of servers) {
        console.log(`\nServer: ${server.name} (${server.uuid})`);
        console.log(`Type: ${server.type}`);
        console.log(`Args: ${JSON.stringify(server.args)}`);
        console.log(`Env: ${JSON.stringify(server.env)}`);

        // Check Env vars
        const env = server.env as Record<string, string> | null;
        if (env && env.NOTION_API_KEY) {
            const key = env.NOTION_API_KEY;
            console.log(`[ENV] NOTION_API_KEY found.`);
            console.log(`Length: ${key.length}`);
            console.log(`Starts with: '${key.substring(0, 5)}...'`);
            console.log(`Ends with: '...${key.substring(key.length - 5)}'`);

            const trimmed = key.trim();
            if (key !== trimmed) {
                console.warn(`[WARNING] Key has whitespace!`);
                console.warn(`Leading whitespace: ${key.match(/^\s+/)?.[0].length || 0} chars`);
                console.warn(`Trailing whitespace: ${key.match(/\s+$/)?.[0].length || 0} chars`);
            } else {
                console.log(`[OK] Key is trimmed.`);
            }
        } else {
            console.log(`[ENV] No NOTION_API_KEY in env.`);
        }
    }

    console.log("\nChecking OAuth Sessions...");
    const sessions = await db.select().from(oauthSessionsTable);
    console.log(`Found ${sessions.length} OAuth sessions.`);

    for (const session of sessions) {
        console.log(`\nSession for Server UUID: ${session.mcp_server_uuid}`);
        const tokens = session.tokens as any;
        if (tokens && tokens.access_token) {
            const key = tokens.access_token;
            console.log(`[OAUTH] access_token found.`);
            console.log(`Length: ${key.length}`);
            console.log(`Starts with: '${key.substring(0, 5)}...'`);
            console.log(`Ends with: '...${key.substring(key.length - 5)}'`);

            const trimmed = key.trim();
            if (key !== trimmed) {
                console.warn(`[WARNING] Token has whitespace!`);
            } else {
                console.log(`[OK] Token is trimmed.`);
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
