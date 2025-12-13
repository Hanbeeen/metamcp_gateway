"use client";

import { IPIDecision } from "@repo/zod-types";
import { AlertTriangle, CheckCircle, ShieldAlert, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useTranslations } from "@/hooks/useTranslations";
import { trpc } from "@/lib/trpc";

export default function IPIDetectionPage() {
    const { t } = useTranslations();
    const utils = trpc.useUtils();
    const [selectedDecision, setSelectedDecision] = useState<IPIDecision | null>(
        null,
    );
    const [showOriginalContent, setShowOriginalContent] = useState(false);

    // 실시간 업데이트를 위해 2초마다 이력 폴링
    const { data: history, isLoading } = trpc.frontend.ipi.getHistory.useQuery(
        undefined,
        {
            refetchInterval: 2000,
        },
    );

    // 알림 로직: 새로운 Pending 항목이 생기면 토스트 알림
    const prevPendingCountRef = React.useRef(0);

    React.useEffect(() => {
        if (!history) return;

        const currentPendingCount = history.filter(h => h.status === "pending").length;

        // 이전보다 Pending 개수가 늘었다면 새 위협 발생으로 간주
        if (currentPendingCount > prevPendingCountRef.current) {
            toast.warning("⚠️ New Threat Detected!", {
                description: "Review required in IPI Detection page.",
                duration: 5000,
                action: {
                    label: "View",
                    onClick: () => {
                        // 현재 페이지에 있으므로 가장 최신 pending 항목 선택
                        const latestPending = history.find(h => h.status === "pending");
                        if (latestPending) setSelectedDecision(latestPending);
                    }
                }
            });

            // (선택 사항) 브라우저 알림 API 호출 가능
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("MetaMCP: Threat Detected", { body: "Action required on tool output." });
            }
        }

        prevPendingCountRef.current = currentPendingCount;
    }, [history]);

    const resolveMutation = trpc.frontend.ipi.resolve.useMutation({
        onSuccess: () => {
            toast.success("결정이 기록되었습니다.");
            utils.frontend.ipi.getHistory.invalidate();
            utils.frontend.ipi.getPending.invalidate();
            setSelectedDecision(null);
        },
        onError: (error) => {
            toast.error("결정 기록 실패: " + error.message);
        },
    });

    /**
     * 사용자 결정 처리 함수
     * @param id 결정 ID
     * @param status 처리 상태 ('allowed' | 'masked' | 'blocked')
     */
    const handleResolve = (
        id: string,
        status: "allowed" | "masked" | "blocked",
    ) => {
        resolveMutation.mutate({ id, status });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "pending":
                return (
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-yellow-500/50">
                        Pending
                    </Badge>
                );
            case "allowed":
                return (
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/50">
                        Allowed
                    </Badge>
                );
            case "blocked":
                return (
                    <Badge variant="destructive">Blocked</Badge>
                );
            case "masked":
                return (
                    <Badge variant="secondary">Masked</Badge>
                );
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <ShieldAlert className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        IPI Detection Log
                    </h1>
                    <p className="text-muted-foreground">
                        Monitor and manage Indirect Prompt Injection threats from MCP tools.
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* 탐지 이력 목록 */}
                <Card className="md:col-span-1 h-[calc(100vh-200px)] flex flex-col">
                    <CardHeader>
                        <CardTitle>Detection History</CardTitle>
                        <CardDescription>
                            Real-time log of tool outputs analyzed for threats.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Time</TableHead>
                                    <TableHead>Tool</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8">
                                            Loading...
                                        </TableCell>
                                    </TableRow>
                                ) : history?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                            No detection events found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    history?.map((decision) => (
                                        <TableRow
                                            key={decision.id}
                                            className={`cursor-pointer ${selectedDecision?.id === decision.id
                                                ? "bg-muted/50"
                                                : ""
                                                }`}
                                            onClick={() => setSelectedDecision(decision)}
                                        >
                                            <TableCell className="whitespace-nowrap">
                                                {new Date(decision.timestamp).toLocaleTimeString()}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {decision.toolName}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(decision.status)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* 상세 보기 */}
                <Card className="md:col-span-1 h-[calc(100vh-200px)] overflow-auto">
                    <CardHeader>
                        <CardTitle>Event Details</CardTitle>
                        {selectedDecision ? (
                            <CardDescription>
                                ID: {selectedDecision.id}
                            </CardDescription>
                        ) : (
                            <CardDescription>Select an event to view details.</CardDescription>
                        )}
                    </CardHeader>
                    <CardContent>
                        {selectedDecision ? (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-muted-foreground">Status</p>
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(selectedDecision.status)}
                                            {selectedDecision.status === "pending" && (
                                                <span className="text-sm text-yellow-600 animate-pulse">
                                                    Action Required
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <p className="text-sm font-medium text-muted-foreground">Detected Threat</p>
                                        <p className="font-mono text-sm text-destructive font-bold">
                                            {selectedDecision.detectedThreat || "Unknown"}
                                        </p>
                                    </div>
                                </div>

                                {selectedDecision.analysisReport && (
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                                            <ShieldAlert className="h-5 w-5" />
                                            Security Analysis Report
                                        </h3>

                                        {(() => {
                                            try {
                                                const report = JSON.parse(selectedDecision.analysisReport);
                                                return (
                                                    <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
                                                        <div className={`p-4 border-b ${report.isAttack ? "bg-red-500/10" : "bg-green-500/10"}`}>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant={report.isAttack ? "destructive" : "outline"} className="text-base px-3 py-1">
                                                                        {report.threatType?.replace(/_/g, " ") || "THREAT DETECTED"}
                                                                    </Badge>
                                                                    {/* 분석 출처 표시 (LLM vs Cache) */}
                                                                    {report.analysisSource && (
                                                                        <Badge variant="secondary" className="text-xs bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700">
                                                                            {report.analysisSource === "LLM" ? "🤖 AI Verified" : "⚡ Known Pattern"}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-sm">
                                                                    <span className="text-muted-foreground font-medium">Confidence Score:</span>
                                                                    <span className={`font-bold ${report.confidence > 0.8 ? "text-red-600 dark:text-red-400" : "text-yellow-600 dark:text-yellow-400"}`}>
                                                                        {(report.confidence * 100).toFixed(1)}%
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <p className="font-medium leading-relaxed text-foreground/90">
                                                                {report.reasoning || report.reason}
                                                            </p>
                                                        </div>

                                                        {report.highlightedSnippets && report.highlightedSnippets.length > 0 && (
                                                            <div className="p-4 bg-muted/30 space-y-3">
                                                                <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                                                                    <AlertTriangle className="h-3 w-3" />
                                                                    Suspicious Content Detected
                                                                </h4>
                                                                <div className="space-y-2">
                                                                    {report.highlightedSnippets.map((snippet: string, idx: number) => (
                                                                        <div key={idx} className="bg-red-500/5 border border-red-200 dark:border-red-900/50 p-3 rounded-md text-sm font-mono text-red-700 dark:text-red-400 break-all">
                                                                            "{snippet.length > 300 ? snippet.slice(0, 300) + "..." : snippet}"
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {report.suggestedAction && (
                                                            <div className="p-3 bg-muted/50 border-t flex justify-between items-center text-sm">
                                                                <span className="font-medium text-muted-foreground">Recommended Action:</span>
                                                                <Badge variant="secondary" className="uppercase tracking-wider">
                                                                    {report.suggestedAction}
                                                                </Badge>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            } catch (e) {
                                                return (
                                                    <div className="p-4 rounded-lg bg-muted border font-mono text-sm whitespace-pre-wrap">
                                                        {selectedDecision.analysisReport}
                                                    </div>
                                                );
                                            }
                                        })()}
                                    </div>
                                )}

                                <div className="space-y-2 pt-4 border-t">
                                    <button
                                        onClick={() => setShowOriginalContent(!showOriginalContent)}
                                        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                                    >
                                        {showOriginalContent ? (
                                            <ChevronUp className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                        {showOriginalContent ? "Hide Original Content" : "View Original Content (JSON)"}
                                        <div className="flex-1 h-px bg-border ml-2" />
                                    </button>

                                    {showOriginalContent && (
                                        <div className="p-4 rounded-md bg-zinc-950 text-zinc-50 font-mono text-xs whitespace-pre-wrap max-h-[400px] overflow-auto border shadow-inner">
                                            {JSON.stringify(selectedDecision.content, null, 2)}
                                        </div>
                                    )}
                                </div>

                                {selectedDecision.status === "pending" && (
                                    <div className="space-y-4 pt-4 border-t">
                                        <h3 className="text-sm font-medium">Take Action</h3>
                                        <div className="grid grid-cols-1 gap-2">
                                            <Button
                                                variant="destructive"
                                                className="w-full justify-start"
                                                onClick={() => handleResolve(selectedDecision.id, "blocked")}
                                                disabled={resolveMutation.isPending}
                                            >
                                                <XCircle className="mr-2 h-4 w-4" />
                                                Block Execution
                                                <span className="ml-auto text-xs opacity-70">
                                                    Stop tool execution
                                                </span>
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                className="w-full justify-start"
                                                onClick={() => handleResolve(selectedDecision.id, "masked")}
                                                disabled={resolveMutation.isPending}
                                            >
                                                <AlertTriangle className="mr-2 h-4 w-4" />
                                                Mask Sensitive Data
                                                <span className="ml-auto text-xs opacity-70">
                                                    Replace threat with ***
                                                </span>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="w-full justify-start hover:bg-green-500/10 hover:text-green-600 hover:border-green-500/50"
                                                onClick={() => handleResolve(selectedDecision.id, "allowed")}
                                                disabled={resolveMutation.isPending}
                                            >
                                                <CheckCircle className="mr-2 h-4 w-4" />
                                                Allow (Risk Accepted)
                                                <span className="ml-auto text-xs opacity-70">
                                                    Pass original content
                                                </span>
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-50">
                                <ShieldAlert className="h-16 w-16" />
                                <p>Select an event from the history list</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
