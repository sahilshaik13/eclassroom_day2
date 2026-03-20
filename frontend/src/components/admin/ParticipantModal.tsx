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
import { Badge } from "@/components/ui/badge";
import { Save, User, Mail, Shield } from "lucide-react";
import api from "@/services/api";
import toast from "react-hot-toast";

interface ParticipantModalProps {
    children?: React.ReactNode;
    item: any;
    type: 'teacher' | 'student';
    onSave: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ParticipantModal({ item, type, onSave, open, onOpenChange }: ParticipantModalProps) {
    const [formData, setFormData] = useState({ ...item });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setFormData({ ...item });
    }, [item]);

    const handleSave = async () => {
        setLoading(true);
        try {
            const endpoint = type === 'teacher' ? `/admin/teachers/${item.id}` : `/admin/students/${item.id}`;
            await api.patch(endpoint, {
                name: formData.name,
                email: formData.email,
            });
            toast.success("Profile updated successfully");
            onSave();
        } catch (error) {
            toast.error("Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    const toggleStatus = async () => {
        setLoading(true);
        try {
            const isDeactivated = !!item.deactivated_at;
            const endpoint = type === 'teacher'
                ? `/admin/teachers/${item.id}/${isDeactivated ? 'activate' : 'deactivate'}`
                : `/admin/students/${item.id}/${isDeactivated ? 'activate' : 'deactivate'}`;

            await api.post(endpoint);
            toast.success(isDeactivated ? "Account activated" : "Account deactivated");
            onSave();
        } catch (error) {
            toast.error("Operation failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <DialogTitle className="text-xl font-bold tracking-tight">
                                {type === 'teacher' ? 'Teacher Profile' : 'Student Profile'}
                            </DialogTitle>
                            <p className="text-sm text-slate-500">Manage account information and status.</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono">{item.id.substring(0, 8)}</Badge>
                    </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Personal Info */}
                    <div className="space-y-4">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 border-b pb-2">
                            <User className="h-4 w-4 text-primary" />
                            Account Details
                        </h3>

                        <div className="grid gap-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input
                                id="name"
                                value={formData.name || ""}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="h-10"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="email">Email Address</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    id="email"
                                    value={formData.email || ""}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="pl-10 h-10"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Status Section */}
                    <div className="space-y-4">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 border-b pb-2">
                            <Shield className="h-4 w-4 text-primary" />
                            Access Control
                        </h3>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50">
                            <div>
                                <p className="text-sm font-medium">Account Status</p>
                                <p className="text-xs text-slate-500">
                                    {item.deactivated_at ? "User cannot access the platform" : "User has full access"}
                                </p>
                            </div>
                            <Button
                                variant={item.deactivated_at ? "default" : "destructive"}
                                size="sm"
                                onClick={toggleStatus}
                                disabled={loading}
                            >
                                {item.deactivated_at ? "Activate" : "Deactivate"}
                            </Button>
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={loading} className="px-8">
                        {loading ? "Saving..." : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save Changes
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
