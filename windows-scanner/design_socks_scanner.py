import json
import os
import queue
import threading
import time
import tkinter as tk
import re
import unicodedata
from tkinter import messagebox, ttk

import keyboard
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "scanner-config.json")
SUPABASE_URL = "https://dtjhuejmxrjkcxzvilgw.supabase.co"
SUPABASE_KEY = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87"

KO_TO_EN = {
    "ㅂ":"Q","ㅈ":"W","ㄷ":"E","ㄱ":"R","ㅅ":"T","ㅛ":"Y","ㅕ":"U","ㅑ":"I","ㅐ":"O","ㅔ":"P",
    "ㅁ":"A","ㄴ":"S","ㅇ":"D","ㄹ":"F","ㅎ":"G","ㅗ":"H","ㅓ":"J","ㅏ":"K","ㅣ":"L",
    "ㅋ":"Z","ㅌ":"X","ㅊ":"C","ㅍ":"V","ㅠ":"B","ㅜ":"N","ㅡ":"M",
    "ᄇ":"Q","ᄌ":"W","ᄃ":"E","ᄀ":"R","ᄉ":"T","ᅭ":"Y","ᅧ":"U","ᅣ":"I","ᅢ":"O","ᅦ":"P",
    "ᄆ":"A","ᄂ":"S","ᄋ":"D","ᄅ":"F","ᄒ":"G","ᅩ":"H","ᅥ":"J","ᅡ":"K","ᅵ":"L",
    "ᄏ":"Z","ᄐ":"X","ᄎ":"C","ᄑ":"V","ᅲ":"B","ᅮ":"N","ᅳ":"M",
    "ᆸ":"Q","ᆽ":"W","ᆮ":"E","ᆨ":"R","ᆺ":"T","ᆷ":"A","ᆫ":"S","ᆼ":"D","ᆯ":"F","ᇂ":"G",
    "ᆿ":"Z","ᇀ":"X","ᆾ":"C","ᇁ":"V"
}


def normalize_code(value: str) -> str:
    raw = unicodedata.normalize("NFD", str(value or ""))
    converted = "".join(KO_TO_EN.get(ch, ch) for ch in raw)
    converted = unicodedata.normalize("NFKC", converted).upper()
    return re.sub(r"[^A-Z0-9_\-~]", "", converted)



class ScannerApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("DESIGN SOCKS 백그라운드 스캐너 V6.2.9")
        self.root.geometry("620x700")
        self.root.minsize(590, 660)
        self.token = ""
        self.buffer = []
        self.last_key_time = 0.0
        self.capture_enabled = False
        self.key_hook = None
        self.enter_hook = None
        self.order_map = {}
        self.events = queue.Queue()
        self.config = self.load_config()
        self.build_ui()
        self.root.after(100, self.process_events)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def load_config(self):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("mode") == "OUT":
                    data["mode"] = "PICK"
                return data
        except Exception:
            return {"email":"", "device_name":"창고PC-1", "mode":"PICK", "increment":1, "customer_name":"", "order_number":""}

    def save_config(self):
        data = {
            "email": self.email_var.get().strip(),
            "device_name": self.device_var.get().strip(),
            "mode": self.mode_var.get(),
            "increment": int(self.increment_var.get()),
            "customer_name": self.customer_var.get().strip(),
            "order_number": self.selected_order_number(),
        }
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def build_ui(self):
        pad = {"padx": 18, "pady": 7}
        ttk.Label(self.root, text="DESIGN SOCKS", font=("Malgun Gothic", 20, "bold")).pack(pady=(18, 2))
        ttk.Label(self.root, text="Windows 백그라운드 바코드 스캐너").pack(pady=(0, 12))

        login = ttk.LabelFrame(self.root, text="관리자 로그인")
        login.pack(fill="x", **pad)
        self.email_var = tk.StringVar(value=self.config.get("email", ""))
        self.password_var = tk.StringVar()
        ttk.Label(login, text="이메일").grid(row=0, column=0, sticky="w", padx=10, pady=7)
        ttk.Entry(login, textvariable=self.email_var, width=38).grid(row=0, column=1, padx=10, pady=7)
        ttk.Label(login, text="비밀번호").grid(row=1, column=0, sticky="w", padx=10, pady=7)
        ttk.Entry(login, textvariable=self.password_var, show="*", width=38).grid(row=1, column=1, padx=10, pady=7)
        ttk.Button(login, text="Supabase 로그인", command=self.login).grid(row=2, column=0, columnspan=2, pady=9)

        settings = ttk.LabelFrame(self.root, text="스캔 설정")
        settings.pack(fill="x", **pad)
        self.device_var = tk.StringVar(value=self.config.get("device_name", "창고PC-1"))
        self.mode_var = tk.StringVar(value=self.config.get("mode", "IN"))
        self.increment_var = tk.StringVar(value=str(self.config.get("increment", 1)))
        self.customer_var = tk.StringVar(value=self.config.get("customer_name", ""))
        self.order_var = tk.StringVar()
        ttk.Label(settings, text="PC 이름").grid(row=0, column=0, sticky="w", padx=10, pady=8)
        ttk.Entry(settings, textvariable=self.device_var, width=25).grid(row=0, column=1, sticky="w", padx=10, pady=8)
        ttk.Label(settings, text="작업 모드").grid(row=1, column=0, sticky="w", padx=10, pady=8)
        ttk.Radiobutton(settings, text="입고", variable=self.mode_var, value="IN").grid(row=1, column=1, sticky="w")
        ttk.Radiobutton(settings, text="피킹검증", variable=self.mode_var, value="PICK").grid(row=1, column=1, padx=(75,0), sticky="w")
        ttk.Radiobutton(settings, text="수동출고", variable=self.mode_var, value="MANUAL_OUT").grid(row=1, column=1, padx=(180,0), sticky="w")
        ttk.Label(settings, text="스캔 1회 수량").grid(row=2, column=0, sticky="w", padx=10, pady=8)
        ttk.Combobox(settings, textvariable=self.increment_var, values=["1","5","10","20"], width=8, state="readonly").grid(row=2, column=1, sticky="w", padx=10, pady=8)
        ttk.Label(settings, text="피킹 주문").grid(row=3, column=0, sticky="w", padx=10, pady=8)
        self.order_combo = ttk.Combobox(settings, textvariable=self.order_var, width=48, state="readonly")
        self.order_combo.grid(row=3, column=1, sticky="w", padx=10, pady=8)
        ttk.Button(settings, text="주문 새로고침", command=self.load_picking_orders).grid(row=4, column=1, sticky="w", padx=10, pady=(0, 8))
        ttk.Label(settings, text="수동출고 거래처").grid(row=5, column=0, sticky="w", padx=10, pady=8)
        ttk.Entry(settings, textvariable=self.customer_var, width=30).grid(row=5, column=1, sticky="w", padx=10, pady=8)
        ttk.Label(settings, text="피킹검증은 주문을 한 번 선택하면 거래처와 출고모드가 자동 적용됩니다.", wraplength=500).grid(row=6, column=0, columnspan=2, sticky="w", padx=10, pady=(2, 8))

        self.capture_btn = ttk.Button(self.root, text="로그인 후 스캔 시작", command=self.toggle_capture, state="disabled")
        self.capture_btn.pack(fill="x", padx=18, pady=10, ipady=10)

        self.status_var = tk.StringVar(value="Supabase 관리자 계정으로 로그인하세요.")
        status = ttk.LabelFrame(self.root, text="상태")
        status.pack(fill="both", expand=True, **pad)
        ttk.Label(status, textvariable=self.status_var, wraplength=450, font=("Malgun Gothic", 12, "bold")).pack(anchor="w", padx=12, pady=10)
        self.history = tk.Text(status, height=8, state="disabled", font=("Consolas", 10))
        self.history.pack(fill="both", expand=True, padx=10, pady=(0,10))
        ttk.Label(self.root, text="스캐너가 빠르게 입력하고 Enter를 보내면 다른 프로그램을 사용 중이어도 감지합니다.", wraplength=470).pack(padx=18, pady=(0,12))

    def login(self):
        email = self.email_var.get().strip()
        password = self.password_var.get()
        if not email or not password:
            messagebox.showwarning("확인", "관리자 이메일과 비밀번호를 입력하세요.")
            return
        self.status_var.set("로그인 중...")
        try:
            r = requests.post(
                f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                headers={"apikey": SUPABASE_KEY, "Content-Type":"application/json"},
                json={"email": email, "password": password}, timeout=15
            )
            r.raise_for_status()
            self.token = r.json()["access_token"]
            self.capture_btn.config(state="normal", text="백그라운드 스캔 시작")
            self.status_var.set("로그인 성공. 스캔 시작 버튼을 누르세요.")
            self.load_picking_orders()
            self.save_config()
        except Exception as e:
            self.status_var.set(f"로그인 실패: {self.error_text(e)}")

    def toggle_capture(self):
        if self.capture_enabled:
            self.stop_keyboard_hooks()
            self.capture_enabled = False
            self.capture_btn.config(text="백그라운드 스캔 시작")
            self.status_var.set("스캔이 일시정지되었습니다.")
            return
        self.save_config()
        self.buffer.clear()
        self.key_hook = keyboard.on_press(self.on_key)
        self.enter_hook = keyboard.on_press_key("enter", self.on_enter, suppress=True)
        self.capture_enabled = True
        self.capture_btn.config(text="백그라운드 스캔 중지")
        self.status_var.set("스캔 대기 중 — 일반 키보드는 사용할 수 있고 바코드 입력은 검색창에서 자동 제거됩니다.")

    def on_key(self, event):
        now = time.monotonic()
        if self.last_key_time and now - self.last_key_time > 0.12:
            self.buffer.clear()
        self.last_key_time = now
        name = event.name or ""
        if name == "esc":
            self.events.put(("stop", ""))
            return
        if name == "enter":
            return
        if len(name) == 1 and (name.isalnum() or name in "-_~"):
            self.buffer.append(name)
        elif name.startswith("num ") and name[-1:].isdigit():
            self.buffer.append(name[-1])

    def on_enter(self, _event):
        now = time.monotonic()
        is_scan = len(self.buffer) >= 1 and self.last_key_time and now - self.last_key_time <= 0.12
        if is_scan:
            raw = "".join(self.buffer)
            self.buffer.clear()
            code = normalize_code(raw)
            for _ in raw:
                keyboard.send("backspace")
            if code:
                self.events.put(("scan", code))
            return

        self.buffer.clear()
        try:
            if self.enter_hook is not None:
                keyboard.unhook(self.enter_hook)
                self.enter_hook = None
            keyboard.send("enter")
        finally:
            if self.capture_enabled:
                self.enter_hook = keyboard.on_press_key("enter", self.on_enter, suppress=True)

    def stop_keyboard_hooks(self):
        for hook in (self.key_hook, self.enter_hook):
            if hook is not None:
                try:
                    keyboard.unhook(hook)
                except Exception:
                    pass
        self.key_hook = None
        self.enter_hook = None
        self.buffer.clear()

    def selected_order_number(self):
        return self.order_map.get(self.order_var.get(), "")

    def load_picking_orders(self):
        if not self.token:
            return
        try:
            response = requests.get(
                f"{SUPABASE_URL}/rest/v1/orders",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {self.token}"},
                params={
                    "select": "order_number,customer_name,created_at,status,picking_status",
                    "status": "neq.출고완료",
                    "order": "created_at.asc",
                    "limit": "5000",
                },
                timeout=15,
            )
            response.raise_for_status()
            unique = {}
            for row in response.json():
                number = str(row.get("order_number") or "").strip()
                picking_status = str(row.get("picking_status") or "")
                if not number or "검증완료" in picking_status:
                    continue
                unique.setdefault(number, row)
            self.order_map = {}
            for number, row in unique.items():
                label = f"{row.get('customer_name') or '거래처 미입력'} | {number}"
                self.order_map[label] = number
            values = list(self.order_map)
            self.order_combo["values"] = values
            saved = str(self.config.get("order_number") or "")
            selected = next((label for label, number in self.order_map.items() if number == saved), "")
            if selected:
                self.order_var.set(selected)
            elif values:
                self.order_var.set(values[0])
            self.status_var.set(f"피킹 대기 주문 {len(values)}건을 불러왔습니다.")
        except Exception as e:
            self.status_var.set(f"피킹 주문 조회 실패: {self.error_text(e)}")

    def process_events(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == "scan":
                    threading.Thread(target=self.send_scan, args=(value,), daemon=True).start()
        except queue.Empty:
            pass
        self.root.after(100, self.process_events)

    def send_scan(self, code):
        self.events.put(("status", f"처리 중: {code}"))
        try:
            mode = self.mode_var.get()
            if mode == "PICK":
                order_number = self.selected_order_number()
                if not order_number:
                    raise RuntimeError("피킹 대기 주문을 선택하세요.")
                r = requests.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/apply_order_picking_scan",
                    headers={
                        "apikey": SUPABASE_KEY,
                        "Authorization": f"Bearer {self.token}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "p_order_number": order_number,
                        "p_item_number": code,
                        "p_increment": int(self.increment_var.get()),
                        "p_device_name": self.device_var.get().strip(),
                    },
                    timeout=15,
                )
                if r.status_code >= 400:
                    raise RuntimeError(r.json().get("message", r.text))
                row = r.json()
                msg = f"피킹 {code} | {row.get('picked_qty')}/{row.get('qty')} | {row.get('customer_name')} | {order_number}"
                self.events.put(("result", msg))
                return

            if mode == "MANUAL_OUT" and not self.customer_var.get().strip():
                raise RuntimeError("출고 모드에서는 출고 거래처를 입력하세요.")
            r = requests.post(
                f"{SUPABASE_URL}/rest/v1/rpc/apply_inventory_scan",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                },
                json={
                    "p_item_number": code,
                    "p_mode": "OUT" if mode == "MANUAL_OUT" else "IN",
                    "p_increment": int(self.increment_var.get()),
                    "p_device_name": self.device_var.get().strip(),
                    "p_order_number": None,
                    "p_customer_name": self.customer_var.get().strip(),
                }, timeout=15
            )
            if r.status_code >= 400:
                raise RuntimeError(r.json().get("message", r.text))
            data = r.json()
            row = data[0] if isinstance(data, list) else data
            msg = f"성공 {code} | {'입고' if mode=='IN' else '수동출고'} {self.increment_var.get()}개 | 재고 {row.get('quantity')}개"
            self.events.put(("result", msg))
        except Exception as e:
            self.events.put(("result", f"실패 {code} | {self.error_text(e)}"))

    def error_text(self, e):
        try:
            if isinstance(e, requests.HTTPError):
                return e.response.json().get("msg") or e.response.json().get("message") or str(e)
        except Exception:
            pass
        return str(e)

    def append_history(self, text):
        self.history.config(state="normal")
        self.history.insert("1.0", f"{time.strftime('%H:%M:%S')}  {text}\n")
        self.history.config(state="disabled")
        self.status_var.set(text)

    def on_close(self):
        try:
            self.stop_keyboard_hooks()
        except Exception:
            pass
        self.save_config()
        self.root.destroy()

    def process_events(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == "scan":
                    threading.Thread(target=self.send_scan, args=(value,), daemon=True).start()
                elif kind in ("status", "result"):
                    self.append_history(value)
                elif kind == "stop" and self.capture_enabled:
                    self.toggle_capture()
        except queue.Empty:
            pass
        self.root.after(100, self.process_events)


if __name__ == "__main__":
    root = tk.Tk()
    app = ScannerApp(root)
    root.mainloop()
