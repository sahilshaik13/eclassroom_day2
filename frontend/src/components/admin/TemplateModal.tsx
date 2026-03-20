"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layers, Calendar, Plus, Loader2 } from "lucide-react";
import api from "@/services/api";
import toast from "react-hot-toast";

interface TemplateModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function TemplateModal({ open, onOpenChange, onSuccess }: TemplateModalProps) {
    const [name, setName] = useState("");
    const [totalDays, setTotalDays] = useState("30");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setName("");
            setTotalDays("30");
        }
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return toast.error("Template name is required");
        if (!totalDays || Number(totalDays) < 1) return toast.error("Total days must be at least 1");
        
        setLoading(true);
        try {
            await api.post('/admin/study-plans', {
                name,
                total_days: Number(totalDays)
            });
            toast.success("Template created successfully");
            onSuccess();
            onOpenChange(false);
        } catch (error) {
            toast.error("Failed to create template");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div>
                        <DialogTitle className="text-xl font-bold tracking-tight">
                            New Study Plan Template
                        </DialogTitle>
                        <p className="text-sm text-slate-500">
                            Create a curriculum structure that can be applied to any class.
                        </p>
                    </div>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Template Name</Label>
                            <div className="relative">
                                <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    id="name"
                                    placeholder="e.g. Qira'at Level 1"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="pl-10 h-10"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="days">Total Duration (Days)</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    id="days"
                                    type="number"
                                    min="1"
                                    value={totalDays}
                                    onChange={(e) => setTotalDays(e.target.value)}
                                    className="pl-10 h-10"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading} className="px-8 bg-black hover:bg-slate-800 text-white font-bold h-10 rounded-lg transition-all shadow-md active:scale-[0.98]">
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Creating...
                                </span>
                            ) : (
                                <>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Initialize Template
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
