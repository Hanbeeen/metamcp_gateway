"use client";

import { IPIDecision } from "@repo/zod-types";
import { AlertTriangle, CheckCircle, ShieldAlert, XCircle } from "lucide-react";
import { useState } from "react";
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

    // Poll for history every 2 seconds to show real-time updates
    const { data: history, isLoading } = trpc.frontend.ipi.getHistory.useQuery(
        undefined,
        {
            refetchInterval: 2000,
        },
    );

    const resolveMutation = trpc.frontend.ipi.resolve.useMutation({
        onSuccess: () => {
            toast.success("Decision recorded");
            utils.frontend.ipi.getHistory.invalidate();
            utils.frontend.ipi.getPending.invalidate();
            setSelectedDecision(null);
        },
        onError: (error) => {
            toast.error("Failed to record decision: " + error.message);
        },
    });

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
                {/* List of Decisions */}
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

                {/* Detail View */}
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
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-medium flex items-center gap-2">
                                            <span className="text-primary">✨</span> AI Analysis Report
                                        </h3>
                                        <div className="p-4 rounded-md bg-primary/5 text-sm whitespace-pre-wrap border border-primary/20">
                                            {selectedDecision.analysisReport}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <h3 className="text-sm font-medium">Original Content</h3>
                                    <div className="p-4 rounded-md bg-muted/50 font-mono text-xs whitespace-pre-wrap max-h-[300px] overflow-auto border">
                                        {JSON.stringify(selectedDecision.content, null, 2)}
                                    </div>
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
