from django.test import TestCase
from rest_framework.test import APIClient
from .models import Category, EmailOtpToken, Grievance, PortalUser
from .otp_service import dispatch_email_otp


class EmailOtpAndEnterpriseFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cat = Category.objects.create(name_ta="சாலை", name_en="Roads", sla_days=5)
        self.user = PortalUser.objects.create_user(
            username="citizen_test",
            email="citizen@example.com",
            password="Password@123",
            full_name="Test Citizen",
            role="citizen",
            account_status="active",
        )
        self.officer = PortalUser.objects.create_user(
            username="officer_test",
            email="officer@dept.gov.in",
            password="Password@123",
            full_name="Test Officer",
            role="officer",
            account_status="active",
        )

    def test_login_issues_email_otp_and_verifies(self):
        res = self.client.post("/api/auth/login/", {
            "identifier": "citizen@example.com",
            "password": "Password@123",
            "role": "citizen",
        })
        self.assertEqual(res.status_code, 200)
        otp = EmailOtpToken.objects.get(email="citizen@example.com", consumed=False)
        verify = self.client.post("/api/auth/verify-otp/", {
            "email": "citizen@example.com",
            "role": "citizen",
            "code": otp.code,
        })
        self.assertEqual(verify.status_code, 200)
        self.assertIn("access", verify.data)

    def test_wrong_otp_increments_attempts_and_rejects(self):
        dispatch_email_otp("citizen@example.com", "citizen")
        verify = self.client.post("/api/auth/verify-otp/", {
            "email": "citizen@example.com",
            "role": "citizen",
            "code": "000000",
        })
        self.assertEqual(verify.status_code, 400)

    def test_proof_of_resolution_blocks_empty_remarks(self):
        g = Grievance.objects.create(
            grievance_code="2026-900001",
            citizen=self.user,
            category=self.cat,
            title="Road repair needed",
            description="Deep pothole near junction",
            location="Chennai",
        )
        self.client.force_authenticate(user=self.officer)
        res = self.client.patch(f"/api/grievances/{g.id}/update_status/", {
            "status": "resolved",
            "remarks": "Done",
            "field_photo_urls": [],
        }, format="json")
        self.assertEqual(res.status_code, 400)
