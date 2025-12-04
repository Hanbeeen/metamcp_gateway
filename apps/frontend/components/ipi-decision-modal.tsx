"use client";

import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

export function IPIDecisionModal() {
    const [isOpen, setIsOpen] = useState(false);
    const utils = trpc.useUtils();

    // Poll for pending decisions every 1 second
    const { data: pendingDecisions } = trpc.frontend.ipi.getPending.useQuery(
        undefined,
        {
            refetchInterval: 1000,
        },
    );

    const resolveMutation = trpc.frontend.ipi.resolve.useMutation({
        onSuccess: () => {
            utils.frontend.ipi.getPending.invalidate();
        },
    });

    const currentDecision = pendingDecisions?.[0];

    useEffect(() => {
        if (currentDecision) {
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    }, [currentDecision]);

    const handleResolve = (status: "allowed" | "masked" | "blocked") => {
        if (!currentDecision) return;

        resolveMutation.mutate({
            id: currentDecision.id,
            status,
        });
    };

    if (!currentDecision) return null;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[500px] border-red-500/50">
                <DialogHeader>
                    <div className="flex items-center gap-2 text-red-500 mb-2">
                        <ShieldAlert className="h-6 w-6" />
                        <DialogTitle>Security Alert: Threat Detected</DialogTitle>
                    </div>
                    <DialogDescription className="text-base">
                        A potential security threat was detected in the tool execution.
                        Please review the details below and choose an action.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <span className="font-bold text-right">Tool:</span>
                        <span className="col-span-3 font-mono text-sm bg-muted p-1 rounded">
                            {currentDecision.toolName}
                        </span>
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                        <span className="font-bold text-right pt-1">Reason:</span>
                        <span className="col-span-3 text-sm text-red-500 font-medium">
                            {currentDecision.detectedThreat || "Unknown Threat"}
                        </span>
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                        <span className="font-bold text-right pt-1">Content:</span>
                        <div className="col-span-3 max-h-[200px] overflow-y-auto bg-muted p-2 rounded text-xs font-mono whitespace-pre-wrap">
                            {JSON.stringify(currentDecision.content, null, 2)}
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="destructive"
                        onClick={() => handleResolve("blocked")}
                        className="w-full sm:w-auto"
                    >
                        Block Execution
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => handleResolve("masked")}
                        className="w-full sm:w-auto"
                    >
                        Mask Sensitive Data
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => handleResolve("allowed")}
                        className="w-full sm:w-auto border-green-500 text-green-500 hover:bg-green-50"
                    >
                        Allow (Risk)
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
