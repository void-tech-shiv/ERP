"""Synthetic HTML cases only. No real student data, credentials or session tokens."""
import pytest
from app.erp_parser import AttendanceParseError, parse_course_list_html

COLUMNS = [
    "#", "Coursecode", "Coursedesc", "Ltps", "Section", "Year", "Semester",
    "Fr Date", "Total Conducted", "Total Attended", "Total Absent", "Tcbr",
    "Percentage", "Attendance Register",
]


def html_table(rows: list[list[str]]) -> str:
    header = "".join(f"<th>{x}</th>" for x in COLUMNS)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in rows)
    return ("<div class='student-daily-attendance-index'><div id='printTable'>"
            f"<table class='table table-striped'><thead><tr>{header}</tr></thead>"
            f"<tbody>{body}</tbody></table></div></div>")


def row(num="1", code="EX101", name="Demo A", part="L", section="A",
        year="2026-2027", semester="Even Sem", conducted="10", attended="8",
        link="/index.php?id=DO_NOT_SAVE_THIS_FAKE_VALUE") -> list[str]:
    return [num, code, name, part, section, year, semester, "N", conducted, attended,
            "2", "0", "80%", f'<a href="{link}">Register</a>']


def test_parse_html_and_discard_student_links():
    html = html_table([
        row(),
        row("2", "EX101", "Demo A", "P", "B", conducted="4", attended="2"),
        row("3", "EX202", "Demo B", "S", "A", conducted="4", attended="3"),
    ])
    courses = parse_course_list_html(html)
    assert len(courses) == 2
    assert courses[0].code == "EX101"
    assert courses[0].components["L"].attended == 8
    assert courses[0].components["P"].conducted == 4
    assert courses[1].components["S"].attended == 3
    assert "DO_NOT_SAVE_THIS_FAKE_VALUE" not in str([c.model_dump() for c in courses])


def test_same_component_in_different_section_is_aggregated():
    courses = parse_course_list_html(html_table([
        row(), row("2", section="B", conducted="5", attended="4")
    ]))
    assert courses[0].components["L"].attended == 12
    assert courses[0].components["L"].conducted == 15


def test_duplicate_row_not_double_counted():
    with pytest.raises(AttendanceParseError, match="Duplicate"):
        parse_course_list_html(html_table([row(), row()]))


def test_invalid_count():
    with pytest.raises(AttendanceParseError, match="exceeds"):
        parse_course_list_html(html_table([row(conducted="4", attended="5")]))


def test_reject_mixed_semester():
    with pytest.raises(AttendanceParseError, match="Mixed"):
        parse_course_list_html(html_table([
            row(), row("2", code="EX102", semester="Odd Sem")
        ]))


def test_reject_login_page_instead_of_attendance():
    with pytest.raises(AttendanceParseError, match="headers"):
        parse_course_list_html("<html><body><form>Login expired</form></body></html>")


def test_empty_attendance_table():
    assert parse_course_list_html(html_table([])) == []


def test_reject_unknown_component():
    with pytest.raises(AttendanceParseError, match="Invalid course"):
        parse_course_list_html(html_table([row(part="X")]))
