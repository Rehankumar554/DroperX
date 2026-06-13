import customtkinter as ctk
import tkinter as tk
from tkinter import filedialog, messagebox
from tkinterdnd2 import DND_FILES, TkinterDnD
import hashlib
import os
import json
import threading
from datetime import datetime
import concurrent.futures

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

class CTkDnD(ctk.CTk, TkinterDnD.DnDWrapper):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.TkdndVersion = TkinterDnD._require(self)

class EnterpriseIntegritySuite:
    def __init__(self, root):
        self.root = root
        self.root.title("DroperX AIV - Enterprise Integrity Suite")
        try:
            icon = tk.PhotoImage(file="app_icon.png")
            self.root.iconphoto(False, icon)
        except Exception:
            pass
        self.root.geometry("900x700")
        self.root.resizable(True, True)
        
        self.batch_data = []
        self.target_algos = ["MD5", "SHA-1", "SHA-256", "SHA-512", "BLAKE2b", "SHA3-256"]
        self.test_history = []
        
        self.cancel_event = threading.Event()
        self.executor = None
        
        self.create_premium_layout()

    def create_premium_layout(self):
        # Header
        self.header_frame = ctk.CTkFrame(self.root, fg_color="transparent")
        self.header_frame.pack(fill="x", padx=30, pady=(15, 5))
        
        self.title_label = ctk.CTkLabel(self.header_frame, text="DroperX AIV Dashboard", font=ctk.CTkFont(family="Segoe UI", size=24, weight="bold"))
        self.title_label.pack(anchor="w")
        
        self.subtitle_label = ctk.CTkLabel(self.header_frame, text="Enterprise-grade parallel cryptographic token signature validation matrix with Drag & Drop.", font=ctk.CTkFont(family="Segoe UI", size=13), text_color="gray60")
        self.subtitle_label.pack(anchor="w", pady=(0, 0))

        # Notebook (Tabview)
        self.tabview = ctk.CTkTabview(self.root)
        self.tabview.pack(fill="both", expand=True, padx=30, pady=5)
        
        for i in range(1, 6):
            tab_name = f"Pair Slot {i}"
            self.tabview.add(tab_name)
            slot_meta = self.build_premium_tab(self.tabview.tab(tab_name), i)
            self.batch_data.append(slot_meta)

        # Bottom Card (Log Console & Progress)
        self.bottom_card = ctk.CTkFrame(self.root)
        self.bottom_card.pack(fill="x", padx=30, pady=(5, 0))
        
        self.progress_bar = ctk.CTkProgressBar(self.bottom_card, mode="determinate")
        self.progress_bar.pack(fill="x", padx=20, pady=(10, 5))
        self.progress_bar.set(0)
        
        # Dedicated Log Terminal
        self.console = ctk.CTkTextbox(self.bottom_card, height=120, font=ctk.CTkFont(family="Courier", size=12), text_color="#A9B1D6")
        self.console.pack(fill="both", padx=20, pady=(5, 10))
        self.console.configure(state="disabled")
        self.log_event("SYSTEM", "Core Initialized. Standby for Batch Deployment Sequence.")

        # Buttons Footer
        self.footer_frame = ctk.CTkFrame(self.root, fg_color="transparent")
        self.footer_frame.pack(fill="x", padx=30, pady=(10, 15))
        
        self.btn_clear_all = ctk.CTkButton(self.footer_frame, text="Clear All Slots", font=ctk.CTkFont(weight="bold"), fg_color="#C53030", hover_color="#9B2C2C", height=40, command=self.clear_all_slots)
        self.btn_clear_all.pack(side="left")

        self.btn_run_batch = ctk.CTkButton(self.footer_frame, text="Execute Batch Verification", font=ctk.CTkFont(weight="bold"), fg_color="#0A84FF", hover_color="#3A9DFF", height=40, command=self.start_parallel_batch)
        self.btn_run_batch.pack(side="right")
        
        self.btn_cancel = ctk.CTkButton(self.footer_frame, text="Cancel Process", font=ctk.CTkFont(weight="bold"), fg_color="#FF453A", hover_color="#D1362D", height=40, state="disabled", command=self.cancel_process)
        self.btn_cancel.pack(side="right", padx=(0, 15))

        self.btn_export_json = ctk.CTkButton(self.footer_frame, text="Export Session Results (JSON)", font=ctk.CTkFont(weight="bold"), fg_color="gray30", hover_color="gray40", height=40, state="disabled", command=self.export_session_to_json)
        self.btn_export_json.pack(side="right", padx=(0, 15))

    def log_event(self, context, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.console.configure(state="normal")
        self.console.insert("end", f"[{timestamp}] [{context}] {message}\n")
        self.console.see("end")
        self.console.configure(state="disabled")
        self.root.update_idletasks()

    def copy_to_clipboard(self, value):
        if value and value != "—":
            self.root.clipboard_clear()
            self.root.clipboard_append(value)
            messagebox.showinfo("Copied", f"Copied to clipboard:\n{value}")

    def build_premium_tab(self, parent, index):
        data_store = {
            "file1_path": "",
            "file2_path": "",
            "row_widgets": {}
        }
        
        wrapper = ctk.CTkScrollableFrame(parent, fg_color="transparent")
        wrapper.pack(fill="both", expand=True, padx=5, pady=5)
        
        # File A
        f1_card = ctk.CTkFrame(wrapper)
        f1_card.pack(fill="x", pady=2)
        lbl_f1 = ctk.CTkLabel(f1_card, text="File A : Drop file here or browse", text_color="gray60")
        lbl_f1.pack(side="left", padx=15, pady=10)
        btn_f1 = ctk.CTkButton(f1_card, text="Browse A", width=100, fg_color="gray30", hover_color="gray40", command=lambda: self.select_premium_file(index-1, 1))
        btn_f1.pack(side="right", padx=15, pady=10)
        
        f1_card.drop_target_register(DND_FILES)
        f1_card.dnd_bind('<<Drop>>', lambda e, si=index-1, ft=1: self.handle_premium_drop(e, si, ft))
        
        # File B
        f2_card = ctk.CTkFrame(wrapper)
        f2_card.pack(fill="x", pady=2)
        lbl_f2 = ctk.CTkLabel(f2_card, text="File B : Drop file here or browse", text_color="gray60")
        lbl_f2.pack(side="left", padx=15, pady=10)
        btn_f2 = ctk.CTkButton(f2_card, text="Browse B", width=100, fg_color="gray30", hover_color="gray40", command=lambda: self.select_premium_file(index-1, 2))
        btn_f2.pack(side="right", padx=15, pady=10)
        
        f2_card.drop_target_register(DND_FILES)
        f2_card.dnd_bind('<<Drop>>', lambda e, si=index-1, ft=2: self.handle_premium_drop(e, si, ft))
        
        # Grid Matrix
        table_frame = ctk.CTkFrame(wrapper)
        table_frame.pack(fill="both", expand=True, pady=10)
        
        # Configure Grid Columns
        table_frame.grid_columnconfigure(0, weight=1)
        table_frame.grid_columnconfigure(1, weight=5)
        table_frame.grid_columnconfigure(2, weight=1) # Copy A
        table_frame.grid_columnconfigure(3, weight=5)
        table_frame.grid_columnconfigure(4, weight=1) # Copy B
        table_frame.grid_columnconfigure(5, weight=2)
        
        headers = ["Algorithm", "File A Hash", "", "File B Hash", "", "Status"]
        for col_idx, text in enumerate(headers):
            lbl = ctk.CTkLabel(table_frame, text=text, font=ctk.CTkFont(weight="bold"), text_color="#0A84FF")
            lbl.grid(row=0, column=col_idx, sticky="nsew", padx=2, pady=5)
            
        for row_idx, algo in enumerate(self.target_algos, start=1):
            lbl_name = ctk.CTkLabel(table_frame, text=algo, font=ctk.CTkFont(weight="bold"))
            lbl_name.grid(row=row_idx, column=0, sticky="nsew", padx=5, pady=5)
            
            ent_f1 = ctk.CTkEntry(table_frame, font=ctk.CTkFont(family="Courier", size=12), text_color="gray60", state="readonly")
            ent_f1.grid(row=row_idx, column=1, sticky="ew", padx=2, pady=5)
            self._set_entry_text(ent_f1, "—")
            
            btn_copy_f1 = ctk.CTkButton(table_frame, text="Copy", width=40, fg_color="gray30", hover_color="gray40", 
                                        command=lambda e=ent_f1: self.copy_to_clipboard(e.get().strip()))
            btn_copy_f1.grid(row=row_idx, column=2, padx=2, pady=5)
            
            ent_f2 = ctk.CTkEntry(table_frame, font=ctk.CTkFont(family="Courier", size=12), text_color="gray60", state="readonly")
            ent_f2.grid(row=row_idx, column=3, sticky="ew", padx=2, pady=5)
            self._set_entry_text(ent_f2, "—")

            btn_copy_f2 = ctk.CTkButton(table_frame, text="Copy", width=40, fg_color="gray30", hover_color="gray40", 
                                        command=lambda e=ent_f2: self.copy_to_clipboard(e.get().strip()))
            btn_copy_f2.grid(row=row_idx, column=4, padx=2, pady=5)
            
            lbl_status = ctk.CTkLabel(table_frame, text="Standby", text_color="gray60")
            lbl_status.grid(row=row_idx, column=5, sticky="nsew", padx=5, pady=5)
            
            data_store["row_widgets"][algo] = {
                "f1": ent_f1,
                "f2": ent_f2,
                "status": lbl_status
            }
            
        data_store["lbl_f1"] = lbl_f1
        data_store["lbl_f2"] = lbl_f2
        return data_store

    def _set_entry_text(self, widget, text, text_color=None):
        widget.configure(state="normal")
        widget.delete(0, "end")
        widget.insert(0, f" {text}")
        widget.configure(state="readonly")
        if text_color:
            widget.configure(text_color=text_color)

    def select_premium_file(self, slot_idx, file_type):
        path = filedialog.askopenfilename()
        if path:
            self.process_file_selection(path, slot_idx, file_type)

    def handle_premium_drop(self, event, slot_idx, file_type):
        raw_path = event.data
        if raw_path.startswith('{') and raw_path.endswith('}'):
            raw_path = raw_path[1:-1]
        if os.path.exists(raw_path):
            self.process_file_selection(raw_path, slot_idx, file_type)

    def process_file_selection(self, path, slot_idx, file_type):
        filename = os.path.basename(path)
        display_text = f"{filename}  |  {path}"
        short_name = display_text if len(display_text) < 110 else display_text[:107] + "..."
        if file_type == 1:
            self.batch_data[slot_idx]["file1_path"] = path
            self.batch_data[slot_idx]["lbl_f1"].configure(text=f"File A : {short_name}", text_color="white")
            self.log_event(f"SLOT {slot_idx+1}", f"Loaded File A: {filename}")
        else:
            self.batch_data[slot_idx]["file2_path"] = path
            self.batch_data[slot_idx]["lbl_f2"].configure(text=f"File B : {short_name}", text_color="white")
            self.log_event(f"SLOT {slot_idx+1}", f"Loaded File B: {filename}")

    def clear_all_slots(self):
        for idx in range(5):
            self.batch_data[idx]["file1_path"] = ""
            self.batch_data[idx]["file2_path"] = ""
            self.batch_data[idx]["lbl_f1"].configure(text="File A : Drop file here or browse", text_color="gray60")
            self.batch_data[idx]["lbl_f2"].configure(text="File B : Drop file here or browse", text_color="gray60")
            for algo in self.target_algos:
                self._set_entry_text(self.batch_data[idx]["row_widgets"][algo]["f1"], "—", "gray60")
                self._set_entry_text(self.batch_data[idx]["row_widgets"][algo]["f2"], "—", "gray60")
                self.batch_data[idx]["row_widgets"][algo]["status"].configure(text="Standby", text_color="gray60")
        self.progress_bar.set(0)
        self.log_event("SYSTEM", "All slots cleared successfully.")

    def cancel_process(self):
        self.log_event("SYSTEM", "Abort signal sent. Waiting for threads to halt...")
        self.cancel_event.set()

    def get_hashers(self):
        return {
            "MD5": hashlib.md5(),
            "SHA-1": hashlib.sha1(),
            "SHA-256": hashlib.sha256(),
            "SHA-512": hashlib.sha512(),
            "BLAKE2b": hashlib.blake2b(),
            "SHA3-256": hashlib.sha3_256()
        }

    def calculate_hashes_single_pass(self, file_path, slot_idx, file_label):
        hashers = self.get_hashers()
        try:
            total_size = os.path.getsize(file_path)
            read_size = 0
            with open(file_path, "rb") as f:
                for byte_block in iter(lambda: f.read(262144), b""):
                    if self.cancel_event.is_set():
                        return None
                    for hasher in hashers.values():
                        hasher.update(byte_block)
                    read_size += len(byte_block)
                    pct = read_size / total_size if total_size > 0 else 1
            return {algo: h.hexdigest() for algo, h in hashers.items()}
        except Exception as e:
            self.root.after(0, lambda: self.log_event(f"SLOT {slot_idx+1}", f"Error reading {file_label}: {str(e)}"))
            return None

    def start_parallel_batch(self):
        self.btn_run_batch.configure(state="disabled", text="Processing...")
        self.btn_export_json.configure(state="disabled")
        self.btn_clear_all.configure(state="disabled")
        self.btn_cancel.configure(state="normal")
        
        self.test_history = []
        self.cancel_event.clear()
        self.progress_bar.set(0)

        slots_to_process = []
        for idx in range(5):
            if self.batch_data[idx]["file1_path"] or self.batch_data[idx]["file2_path"]:
                slots_to_process.append(idx)
            for algo in self.target_algos:
                self._set_entry_text(self.batch_data[idx]["row_widgets"][algo]["f1"], "—", "gray60")
                self._set_entry_text(self.batch_data[idx]["row_widgets"][algo]["f2"], "—", "gray60")
                self.batch_data[idx]["row_widgets"][algo]["status"].configure(text="Standby", text_color="gray60")

        if not slots_to_process:
            self.log_event("ERROR", "No files loaded in any slot. Execution aborted.")
            self._reset_buttons()
            return

        self.log_event("SYSTEM", f"Starting parallel execution on {len(slots_to_process)} active slots...")
        threading.Thread(target=self.parallel_engine_controller, args=(slots_to_process,), daemon=True).start()

    def parallel_engine_controller(self, slots_to_process):
        results = {}
        total_slots = len(slots_to_process)
        completed = 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(self.process_single_slot, idx): idx for idx in slots_to_process}
            
            for future in concurrent.futures.as_completed(futures):
                idx = futures[future]
                try:
                    slot_report = future.result()
                    if slot_report:
                        self.test_history.append(slot_report)
                    completed += 1
                    self.root.after(0, lambda c=completed, t=total_slots: self.progress_bar.set(c/t))
                except Exception as e:
                    self.root.after(0, lambda: self.log_event("ERROR", f"Thread failure in Slot {idx+1}: {str(e)}"))

        if self.cancel_event.is_set():
            self.root.after(0, lambda: self.log_event("SYSTEM", "Execution was aborted by the user."))
        else:
            self.root.after(0, lambda: self.log_event("SUCCESS", "System Verification Matrix Completed."))
        
        self.root.after(0, self._reset_buttons)

    def process_single_slot(self, idx):
        if self.cancel_event.is_set(): return None
        
        f1 = self.batch_data[idx]["file1_path"]
        f2 = self.batch_data[idx]["file2_path"]
        
        h_f1, h_f2 = {}, {}
        
        if f1:
            self.root.after(0, lambda: self.log_event(f"SLOT {idx+1}", "Generating File A tokens..."))
            h_f1 = self.calculate_hashes_single_pass(f1, idx, "File A")
            if self.cancel_event.is_set() or h_f1 is None: return None
            for algo, val in h_f1.items():
                self.root.after(0, lambda a=algo, v=val: self._set_entry_text(self.batch_data[idx]["row_widgets"][a]["f1"], v, "white"))

        if f2:
            self.root.after(0, lambda: self.log_event(f"SLOT {idx+1}", "Generating File B tokens..."))
            h_f2 = self.calculate_hashes_single_pass(f2, idx, "File B")
            if self.cancel_event.is_set() or h_f2 is None: return None
            for algo, val in h_f2.items():
                self.root.after(0, lambda a=algo, v=val: self._set_entry_text(self.batch_data[idx]["row_widgets"][a]["f2"], v, "white"))

        status_text = "GENERATED"
        if f1 and f2:
            all_match = True
            for algo in self.target_algos:
                hash_a = h_f1.get(algo, "")
                hash_b = h_f2.get(algo, "")
                if hash_a == hash_b:
                    self.root.after(0, lambda a=algo, i=idx: self.batch_data[i]["row_widgets"][a]["status"].configure(text="✔ VERIFIED", text_color="#30D158"))
                else:
                    all_match = False
                    self.root.after(0, lambda a=algo, i=idx: self.batch_data[i]["row_widgets"][a]["status"].configure(text="✘ MISMATCH", text_color="#FF453A"))
            status_text = "VERIFIED" if all_match else "MISMATCH"
            msg = "MATCH DETECTED" if all_match else "MISMATCH DETECTED"
            self.root.after(0, lambda m=msg: self.log_event(f"SLOT {idx+1}", m))
        else:
            for algo in self.target_algos:
                self.root.after(0, lambda a=algo, i=idx: self.batch_data[i]["row_widgets"][a]["status"].configure(text="GENERATED", text_color="#0A84FF"))

        return {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "slot_index": idx + 1,
            "status": status_text,
            "file_a": {"filename": os.path.basename(f1) if f1 else None, "absolute_path": f1 if f1 else None, "hashes": h_f1},
            "file_b": {"filename": os.path.basename(f2) if f2 else None, "absolute_path": f2 if f2 else None, "hashes": h_f2}
        }

    def _reset_buttons(self):
        self.btn_run_batch.configure(state="normal", text="Execute Batch Verification")
        self.btn_clear_all.configure(state="normal")
        self.btn_cancel.configure(state="disabled")
        if self.test_history and not self.cancel_event.is_set():
            self.btn_export_json.configure(state="normal")

    def export_session_to_json(self):
        if not self.test_history:
            messagebox.showwarning("Export Failed", "No verification results found.")
            return

        target_file = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("JSON Files", "*.json")],
            title="Export Batch Audit Logs",
            initialfile=f"DroperX_AIV_Audit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
        
        if target_file:
            try:
                with open(target_file, "w", encoding="utf-8") as json_file:
                    json.dump(self.test_history, json_file, indent=4, ensure_ascii=False)
                self.log_event("EXPORT", f"Audit logs exported to {os.path.basename(target_file)}")
                messagebox.showinfo("Export Successful", f"Audit logs exported successfully to:\n{target_file}")
            except Exception as e:
                messagebox.showerror("Export Error", f"Failed to write JSON logs to disk:\n{str(e)}")

if __name__ == "__main__":
    root = CTkDnD()
    app = EnterpriseIntegritySuite(root)
    root.mainloop()