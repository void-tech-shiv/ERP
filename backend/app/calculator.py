"""Pure weighted LTPS calculation shared by all API routes."""
from math import ceil, floor
from typing import Literal
from pydantic import BaseModel, Field, model_validator

Part = Literal["L", "T", "P", "S"]
WEIGHTS = {"L": 1.0, "T": 0.5, "P": 0.5, "S": 0.25}

class Counts(BaseModel):
    attended: int = Field(ge=0)
    conducted: int = Field(ge=0)

    @model_validator(mode="after")
    def valid_counts(self):
        if self.attended > self.conducted:
            raise ValueError("attended cannot exceed conducted")
        return self

class Course(BaseModel):
    code: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=160)
    components: dict[Part, Counts] = Field(min_length=1)

class CalculationRequest(BaseModel):
    courses: list[Course]
    target: float = Field(default=85, gt=0, lt=100)
    future_component: Part = "L"

def project(attended: float, conducted: float, target: float, part: Part):
    if not conducted:
        return {"canMiss": 0, "mustAttend": None}
    ratio = target / 100
    weight = WEIGHTS[part]
    can_miss = max(0, floor((attended / ratio - conducted) / weight + 1e-9))
    must_attend = (0 if attended / conducted >= ratio - 1e-12 else
                   max(0, ceil((ratio * conducted - attended) / (weight * (1 - ratio)) - 1e-9)))
    return {"canMiss": can_miss, "mustAttend": must_attend}

def calculate(payload: CalculationRequest):
    courses = []
    overall_attended = overall_conducted = 0.0
    for course in payload.courses:
        attended = conducted = 0.0
        components = []
        for part in ("L", "T", "P", "S"):
            if part not in course.components:
                continue
            count = course.components[part]
            weight = WEIGHTS[part]
            attended += count.attended * weight
            conducted += count.conducted * weight
            components.append({
                "type": part, "weight": weight,
                "attended": count.attended, "conducted": count.conducted,
                "percentage": round(100 * count.attended / count.conducted, 2) if count.conducted else None,
            })
        overall_attended += attended
        overall_conducted += conducted
        courses.append({
            "code": course.code, "name": course.name, "components": components,
            "weightedAttended": attended, "weightedConducted": conducted,
            "percentage": round(100 * attended / conducted, 2) if conducted else None,
            "projection": project(attended, conducted, payload.target, payload.future_component),
        })
    return {
        "weights": WEIGHTS, "target": payload.target, "futureComponent": payload.future_component,
        "courses": courses,
        "overall": {
            "weightedAttended": overall_attended, "weightedConducted": overall_conducted,
            "percentage": round(100 * overall_attended / overall_conducted, 2) if overall_conducted else None,
            "projection": project(overall_attended, overall_conducted, payload.target, payload.future_component),
        },
    }
