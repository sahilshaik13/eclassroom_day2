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
import { User, Mail, Phone, Plus, GraduationCap } from "lucide-react";
import api, { ApiClientError } from "@/services/api";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";

interface InviteUserModalProps {
    type: 'teacher' | 'student';
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function InviteUserModal({ type, open, onOpenChange, onSuccess }: InviteUserModalProps) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [classId, setClassId] = useState("");
    const [classes, setClasses] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const baseRoute = isAdmin ? '/admin' : '/teacher';

    useEffect(() => {
        if (open) {
            setName("");
            setEmail("");
            setPhone("");
            setClassId("");
            if (type === 'student') {
                api.get(`${baseRoute}/classes?limit=100`)
                    .then(res => setClasses(res.data.data))
                    .catch(() => toast.error("Could not load classes"));
            }
        }
    }, [open, type]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (type === 'teacher') {
                if (!name || !email) return toast.error("Name and Email are required");
                await api.post('/admin/teachers', { name, email });
                toast.success("Teacher invited successfully");
            } else {
                if (!name || !phone) return toast.error("Name and Phone are required");
                await api.post(`${baseRoute}/students`, { name, phone, class_id: classId || undefined });
                toast.success("Student added successfully");
            }
            if (onSuccess) onSuccess();
            onOpenChange(false);
        } catch (error) {
            if (error instanceof ApiClientError) {
                toast.error(error.message);
            } else {
                toast.error(`Failed to ${type === 'teacher' ? 'invite teacher' : 'add student'}`);
            }
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
                            {type === 'teacher' ? 'Invite Teacher' : 'Add New Student'}
                        </DialogTitle>
                        <p className="text-sm text-slate-500">
                            {type === 'teacher' 
                                ? "Send an email invitation to a new teacher." 
                                : "Register a new student to the platform."}
                        </p>
                    </div>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Full Name</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    id="name"
                                    placeholder="Full Name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="pl-10 h-10"
                                    required
                                />
                            </div>
                        </div>

                        {type === 'teacher' ? (
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email Address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="email@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-10 h-10"
                                        required
                                    />
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            id="phone"
                                            placeholder="+91..."
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            className="pl-10 h-10"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="class">Assign Class (Optional)</Label>
                                    <div className="relative">
                                        <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <select
                                            id="class"
                                            value={classId}
                                            onChange={(e) => setClassId(e.target.value)}
                                            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-10 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <option value="">Select a class</option>
                                            {classes.map((cls) => (
                                                <option key={cls.id} value={cls.id}>
                                                    {cls.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading} className="px-8 bg-primary hover:bg-primary/90 text-white font-bold h-10 rounded-lg transition-all shadow-md active:scale-[0.98]">
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Processing...
                                </span>
                            ) : (
                                <>
                                    <Plus className="mr-2 h-4 w-4" />
                                    {type === 'teacher' ? 'Send Invite' : 'Add Student'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
