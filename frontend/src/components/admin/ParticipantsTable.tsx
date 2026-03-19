"use client";

import { useState } from "react";
import { ParticipantModal } from "./ParticipantModal";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    ChevronDown,
    Search,
    Clock,
    XCircle,
    Columns3,
    RotateCcw,
    CheckCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// All available columns
const ALL_COLUMNS = [
    { key: "id", label: "ID", defaultVisible: true },
    { key: "name", label: "Name", defaultVisible: true },
    { key: "email", label: "Email", defaultVisible: true },
    { key: "role", label: "Role", defaultVisible: true },
    { key: "status", label: "Status", defaultVisible: true },
];

function StatusBadge({ status }: { status: string }) {
    switch (status.toLowerCase()) {
        case "active":
        case "verified":
            return (
                <div className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Active</span>
                </div>
            );
        case "pending":
            return (
                <div className="flex items-center gap-1.5 text-amber-600">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Pending</span>
                </div>
            );
        case "inactive":
        case "rejected":
        case "deactivated":
            return (
                <div className="flex items-center gap-1.5 text-red-600">
                    <XCircle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Inactive</span>
                </div>
            );
        default:
            return <span className="text-xs text-slate-400">{status}</span>;
    }
}

interface ParticipantsTableProps {
    data: any[];
    type: 'teacher' | 'student';
    onEdit?: (item: any) => void;
    onRefresh?: () => void;
}

export function ParticipantsTable({ data, type, onEdit, onRefresh }: ParticipantsTableProps) {
    const [globalFilter, setGlobalFilter] = useState("");
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    // Column visibility state
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
        Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.defaultVisible]))
    );

    const toggleColumn = (key: string) => {
        setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Filtering Logic
    const filteredData = data.filter((item) => {
        const matchesGlobal =
            (item.name || "").toLowerCase().includes(globalFilter.toLowerCase()) ||
            (item.id || "").toLowerCase().includes(globalFilter.toLowerCase()) ||
            (item.email || "").toLowerCase().includes(globalFilter.toLowerCase());

        return matchesGlobal;
    });

    const handleRowClick = (item: any) => {
        setSelectedItem(item);
        setModalOpen(true);
        if (onEdit) onEdit(item);
    };

    return (
        <div className="space-y-4">
            {/* Filters Toolbar */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 items-center gap-2">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder={`Search ${type}s...`}
                            className="pl-10 h-10"
                            value={globalFilter}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                        />
                    </div>

                    <Button variant="ghost" size="sm" className="text-slate-500" onClick={() => {
                        setGlobalFilter("");
                    }}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Reset
                    </Button>
                </div>

                {/* Column Visibility Toggle */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 h-10">
                            <Columns3 className="h-4 w-4" />
                            Columns
                            <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {ALL_COLUMNS.map(col => (
                            <DropdownMenuCheckboxItem
                                key={col.key}
                                checked={visibleColumns[col.key]}
                                onCheckedChange={() => toggleColumn(col.key)}
                            >
                                {col.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Scrollable Table */}
            <div className="rounded-xl border border-slate-200 bg-white/50 backdrop-blur-sm shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow>
                            {visibleColumns.id && <TableHead className="w-[80px]">ID</TableHead>}
                            {visibleColumns.name && <TableHead>Name</TableHead>}
                            {visibleColumns.email && <TableHead>Email</TableHead>}
                            {visibleColumns.role && <TableHead>Role</TableHead>}
                            {visibleColumns.status && <TableHead>Status</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={Object.values(visibleColumns).filter(Boolean).length} className="h-32 text-center text-slate-500">
                                    No {type}s found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredData.map((item) => (
                                <TableRow
                                    key={item.id}
                                    className="group hover:bg-slate-50 cursor-pointer transition-colors"
                                    onClick={() => handleRowClick(item)}
                                >
                                    {visibleColumns.id && (
                                        <TableCell className="font-mono text-[10px] text-slate-400">
                                            {item.id.substring(0, 8)}...
                                        </TableCell>
                                    )}
                                    {visibleColumns.name && (
                                        <TableCell className="font-medium text-slate-900">
                                            {item.name}
                                        </TableCell>
                                    )}
                                    {visibleColumns.email && (
                                        <TableCell className="text-slate-600 text-sm">
                                            {item.email}
                                        </TableCell>
                                    )}
                                    {visibleColumns.role && (
                                        <TableCell>
                                            <Badge variant="secondary" className="capitalize text-[10px] px-2 py-0">
                                                {item.role || type}
                                            </Badge>
                                        </TableCell>
                                    )}
                                    {visibleColumns.status && (
                                        <TableCell>
                                            <StatusBadge status={item.deactivated_at ? "Inactive" : "Active"} />
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-2">
                <div className="text-xs text-slate-500">
                    Showing {filteredData.length} of {data.length} {type}s
                </div>
            </div>

            {/* Participant Modal — triggered by row click */}
            {selectedItem && (
                <ParticipantModal
                    item={selectedItem}
                    type={type}
                    onSave={() => {
                        if (onRefresh) onRefresh();
                        setModalOpen(false);
                    }}
                    open={modalOpen}
                    onOpenChange={setModalOpen}
                />
            )}
        </div>
    );
}
