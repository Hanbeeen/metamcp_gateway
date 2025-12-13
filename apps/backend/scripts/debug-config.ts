
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from root
config({ path: path.resolve(__dirname, "../../../.env") });

import { configService } from "../src/lib/config.service.js";

async function main() {
    console.log("Reading OpenAI API Key...");
    const initialKey = await configService.getOpenaiApiKey();
    console.log("Current Key:", initialKey);

    const testKey = "sk-test-" + Date.now();
    console.log("Setting new key:", testKey);
    await configService.setOpenaiApiKey(testKey);

    console.log("Reading key again...");
    const newKey = await configService.getOpenaiApiKey();
    console.log("New Key:", newKey);

    if (newKey === testKey) {
        console.log("SUCCESS: Key persisted in DB.");
    } else {
        console.log("FAILURE: Key not persisted.");
    }
}

main().catch(console.error).finally(() => process.exit(0));
