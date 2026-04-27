import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

export function Modal({ open, onClose, title, children, size = "md" }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={`relative z-10 w-full ${sizes[size]} max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col`}
          >
            {title && (
              <div className="flex items-center justify-between border-b px-4 sm:px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100 transition-colors">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-4 sm:px-6 py-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
