import pytest
from pydantic import ValidationError
from app.calculator import Counts, Course, CalculationRequest, calculate, project

def test_weighted_attendance():
    req = CalculationRequest(courses=[Course(code="TEST", name="Test", components={
        "L": Counts(attended=8, conducted=10),
        "T": Counts(attended=2, conducted=4),
        "S": Counts(attended=1, conducted=4),
    })])
    data = calculate(req)
    assert data["overall"]["weightedAttended"] == 9.25
    assert data["overall"]["weightedConducted"] == 13
    assert data["overall"]["percentage"] == 71.15

def test_zero_classes():
    req = CalculationRequest(courses=[Course(code="X", name="Empty",
                              components={"L": Counts(attended=0, conducted=0)})])
    assert calculate(req)["overall"]["percentage"] is None

def test_recovery_and_bunk():
    assert project(8, 10, 85, "L") == {"canMiss": 0, "mustAttend": 4}
    assert project(9, 10, 85, "L") == {"canMiss": 0, "mustAttend": 0}
    assert project(9, 10, 80, "L")["canMiss"] == 1

def test_invalid_attendance():
    with pytest.raises(ValidationError):
        Counts(attended=12, conducted=10)

def test_unknown_component():
    with pytest.raises(ValidationError):
        Course(code="X", name="X", components={"Z": Counts(attended=2, conducted=2)})

def test_multiple_subjects():
    req = CalculationRequest(courses=[
        Course(code="A", name="A", components={"L": Counts(attended=4, conducted=5)}),
        Course(code="B", name="B", components={"P": Counts(attended=2, conducted=4)}),
    ])
    assert calculate(req)["overall"]["percentage"] == 71.43
