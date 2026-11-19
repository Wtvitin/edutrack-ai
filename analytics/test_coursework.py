import unittest
from calculate_progress import calculate_progress
from search_subjects import search_subjects
from generate_report import generate_report


class CourseworkTest(unittest.TestCase):
    def snapshot(self):
        return {"today": "2026-11-19", "data": {"subjects": [{"id": "a", "name": "Estatística <I>"}, {"id": "b", "name": "SQL"}, {"id": "c", "name": "Python"}], "tasks": [{"subjectId": "a", "status": "COMPLETED", "done": True, "due": "2026-11-17"}, {"subjectId": "a", "status": "TODO", "done": False, "due": "2026-11-20"}, {"subjectId": "b", "status": "TODO", "done": False, "due": "2026-11-18"}, {"subjectId": "c", "status": "TODO", "done": False, "due": "2026-11-19"}, {"subjectId": "c", "status": "CANCELLED", "done": False, "due": "2026-11-01"}]}}

    def test_percentage_and_cancelled(self):
        self.assertEqual(calculate_progress(self.snapshot()["data"]["tasks"][:2])["percentage"], 50)
        self.assertEqual(calculate_progress(self.snapshot()["data"]["tasks"])["total"], 4)

    def test_empty_and_all_cancelled(self):
        for tasks in ([], [{"status": "CANCELLED"}]):
            self.assertEqual(calculate_progress(tasks), {"completed": 0, "total": 0, "percentage": 0.0})

    def test_invalid_tasks(self):
        for tasks in (None, {}, [1]):
            with self.assertRaises(ValueError):
                calculate_progress(tasks)

    def test_name_accents_case_and_or(self):
        payload = self.snapshot()
        payload.update(query="ESTATISTICA", overdue=True)
        result = search_subjects(payload)["items"]
        self.assertEqual([row["id"] for row in result], ["a", "b"])
        self.assertEqual(result[0]["matchedBy"], ["name"])
        self.assertEqual(result[1]["matchedBy"], ["overdue"])

    def test_due_today_completed_and_cancelled_are_not_overdue(self):
        payload = self.snapshot()
        payload["overdue"] = True
        self.assertEqual([row["id"] for row in search_subjects(payload)["items"]], ["b"])

    def test_no_filter_and_no_match(self):
        payload = self.snapshot()
        self.assertEqual(len(search_subjects(payload)["items"]), 3)
        payload["query"] = "no match"
        self.assertEqual(search_subjects(payload)["items"], [])

    def test_pdf_generates_for_names_with_markup_and_empty_data(self):
        for payload in (self.snapshot(), {"today": "2026-11-19", "data": {"subjects": [], "tasks": []}}):
            result = generate_report(payload)
            self.assertTrue(result.startswith(b"%PDF-"))
            self.assertTrue(result.rstrip().endswith(b"%%EOF"))


if __name__ == "__main__":
    unittest.main()
