"""Demo API only. ERP login remains disabled until approved and verified."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .calculator import CalculationRequest, calculate

app = FastAPI(title="KL LTPS Attendance API", version="0.1.0",
              docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

SAMPLE_COURSES = [
  {"code":"25AI2101","name":"Machine Learning","components":{"L":{"attended":34,"conducted":40},"T":{"attended":11,"conducted":12},"P":{"attended":16,"conducted":18}}},
  {"code":"25CS2202","name":"Database Management Systems","components":{"L":{"attended":38,"conducted":42},"P":{"attended":14,"conducted":18}}},
  {"code":"25MA2103","name":"Probability & Statistics","components":{"L":{"attended":29,"conducted":38},"T":{"attended":10,"conducted":14}}},
  {"code":"25AI2204","name":"Deep Learning Foundations","components":{"L":{"attended":37,"conducted":40},"P":{"attended":17,"conducted":20},"S":{"attended":5,"conducted":8}}},
  {"code":"25UC2205","name":"Professional Communication","components":{"L":{"attended":26,"conducted":30},"S":{"attended":10,"conducted":12}}},
]

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/integration/status")
def integration_status():
    return {"enabled": False, "reason": "ERP login/session endpoints are not verified"}

@app.get("/api/demo/attendance")
def demo():
    return {"source": "demo", "student": {"id": "DEMO", "name": "Demo Student"},
            **calculate(CalculationRequest(courses=SAMPLE_COURSES))}

@app.post("/api/calculate")
def calculate_api(payload: CalculationRequest):
    return calculate(payload)

@app.get("/api/auth/captcha")
def captcha_disabled():
    raise HTTPException(status_code=503, detail="Live ERP integration is not enabled")

@app.post("/api/auth/login")
def login_disabled():
    raise HTTPException(status_code=503, detail="Live ERP integration is not enabled")

@app.get("/api/attendance")
def attendance_disabled():
    raise HTTPException(status_code=401, detail="ERP login integration not configured")
