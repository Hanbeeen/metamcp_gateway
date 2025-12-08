/**
 * Notion 환경 변수 자동 수정 스크립트
 * 
 * Notion MCP 서버의 환경 변수 이름이 잘못 설정된 경우(`API_KEY`, `NOTION_TOKEN` 등)를 찾아
 * 표준 이름인 `NOTION_API_KEY`로 자동 변경합니다.
 * 
 * 실행 방법: npx tsx scripts/fix-notion-env-var.ts
 */

import { db } from "../src/db";
import { mcpServersTable } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
    console.log("Notion 환경 변수 수정 시작...");

    const servers = await db.select().from(mcpServersTable);

    for (const server of servers) {
        // Notion 관련 서버만 대상
        if (server.name.toLowerCase().includes("notion")) {
            const env = server.env as Record<string, string>;
            if (env) {
                console.log(`서버 '${server.name}' 발견. 환경 변수 검사 중...`);

                const newEnv = { ...env };
                // 사용 가능한 모든 키 확인 (NOTION_API_KEY 우선)
                let key = newEnv.NOTION_API_KEY || newEnv.API_KEY || newEnv.NOTION_TOKEN;

                if (key) {
                    console.log("유효한 키 발견. NOTION_API_KEY 및 NOTION_TOKEN 동기화 중...");

                    // 표준 키 이름으로 설정
                    newEnv.NOTION_API_KEY = key;
                    newEnv.NOTION_TOKEN = key;

                    // 불필요한 레거시 키 제거 (API_KEY)
                    if (newEnv.API_KEY) delete newEnv.API_KEY;

                    // DB 업데이트
                    await db.update(mcpServersTable)
                        .set({ env: newEnv })
                        .where(eq(mcpServersTable.uuid, server.uuid));

                    console.log("환경 변수 업데이트 완료.");
                } else {
                    console.log("환경 변수에서 유효한 키를 찾을 수 없습니다.");
                }
            } else {
                console.log(`서버 '${server.name}'는 수정할 내용이 없습니다.`);
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
