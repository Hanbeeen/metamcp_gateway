/**
 * Notion 토큰 및 환경 변수 디버깅 스크립트
 * 
 * 이 스크립트는 데이터베이스(`mcpServersTable`, `oauthSessionsTable`)를 조회하여
 * Notion API 키나 OAuth 토큰이 올바르게 저장되어 있는지 확인합니다.
 * 특히, 키 앞뒤에 공백(whitespace)이 포함되어 인증 실패(401)를 유발하는지 검사합니다.
 * 
 * 실행 방법: npx tsx scripts/debug-notion-token.ts
 */

import { db } from "../src/db";
import { mcpServersTable, oauthSessionsTable } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
    console.log("Notion 설정 및 토큰 검사 시작...");

    // 1. MCP 서버 설정 확인 (mcpServersTable)
    const servers = await db.select().from(mcpServersTable);

    console.log(`${servers.length}개의 서버를 찾았습니다.`);

    for (const server of servers) {
        console.log(`\n[서버 정보] 이름: ${server.name} (UUID: ${server.uuid})`);
        console.log(`유형: ${server.type}`);
        console.log(`인자(Args): ${JSON.stringify(server.args)}`);

        // 환경 변수 검사
        const env = server.env as Record<string, string> | null;
        if (env && env.NOTION_API_KEY) {
            const key = env.NOTION_API_KEY;
            console.log(`[ENV] NOTION_API_KEY 발견됨.`);
            console.log(`길이: ${key.length}`);
            console.log(`시작 문자: '${key.substring(0, 5)}...'`);
            console.log(`종료 문자: '...${key.substring(key.length - 5)}'`);

            const trimmed = key.trim();
            if (key !== trimmed) {
                console.warn(`[WARNING] 키에 공백이 포함되어 있습니다!`);
                console.warn(`앞 공백: ${key.match(/^\s+/)?.[0].length || 0}자`);
                console.warn(`뒤 공백: ${key.match(/\s+$/)?.[0].length || 0}자`);
            } else {
                console.log(`[OK] 키에 공백이 없습니다.`);
            }
        } else {
            console.log(`[ENV] 환경 변수에 NOTION_API_KEY가 없습니다.`);
        }
    }

    console.log("\nOAuth 세션 검사 중...");
    const sessions = await db.select().from(oauthSessionsTable);
    console.log(`${sessions.length}개의 OAuth 세션을 찾았습니다.`);

    for (const session of sessions) {
        console.log(`\n[세션] 서버 UUID: ${session.mcp_server_uuid}`);
        const tokens = session.tokens as any;

        // 액세스 토큰 검사
        if (tokens && tokens.access_token) {
            const key = tokens.access_token;
            console.log(`[OAUTH] access_token 발견됨.`);
            console.log(`길이: ${key.length}`);

            const trimmed = key.trim();
            if (key !== trimmed) {
                console.warn(`[WARNING] 토큰에 공백이 포함되어 있습니다!`);
            } else {
                console.log(`[OK] 토큰에 공백이 없습니다.`);
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
