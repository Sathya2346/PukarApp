from django.contrib.auth.models import AbstractUser
from django.db import models


class Department(models.Model):
    name_ta = models.CharField(max_length=150)
    name_en = models.CharField(max_length=150)
    head_designation = models.CharField(max_length=150, blank=True, default="")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "departments"


class Category(models.Model):
    name_ta = models.CharField(max_length=150)
    name_en = models.CharField(max_length=150)
    icon_key = models.CharField(max_length=40, default="other")
    color_key = models.CharField(max_length=40, default="slate")
    sla_days = models.PositiveIntegerField(default=7)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "categories"


class PortalUser(AbstractUser):
    ROLE_CHOICES = (
        ("citizen", "Citizen"),
        ("officer", "Officer"),
        ("admin", "Admin"),
    )
    SUB_ROLE_CHOICES = (
        ("officer", "Officer"),
        ("field_worker", "Field Worker"),
    )
    STATUS_CHOICES = (
        ("active", "Active"),
        ("pending", "Pending Approval"),
        ("blocked", "Blocked"),
        ("inactive", "Inactive"),
    )

    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default="citizen")
    sub_role = models.CharField(max_length=20, choices=SUB_ROLE_CHOICES, default="officer")
    full_name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=24, blank=True, default="")
    district = models.CharField(max_length=100, blank=True, default="")
    area = models.CharField(max_length=120, blank=True, default="")
    designation = models.CharField(max_length=150, blank=True, default="")
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.SET_NULL)
    location = models.CharField(max_length=180, blank=True, default="")
    account_status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="active")

    class Meta:
        db_table = "portal_users"


class EmailOtpToken(models.Model):
    email = models.EmailField(db_index=True)
    role = models.CharField(max_length=16)
    purpose = models.CharField(max_length=24, default="login")
    code = models.CharField(max_length=6)
    expires_at = models.DateTimeField()
    attempts = models.PositiveIntegerField(default=0)
    consumed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "email_otp_tokens"


class Grievance(models.Model):
    STATUS_CHOICES = (
        ("new", "New"),
        ("assigned", "Assigned"),
        ("in_progress", "In Progress"),
        ("resolved", "Resolved"),
        ("overdue", "Overdue"),
    )
    PRIORITY_CHOICES = (
        ("high", "High"),
        ("medium", "Medium"),
        ("low", "Low"),
    )

    grievance_code = models.CharField(max_length=32, unique=True)
    citizen = models.ForeignKey(PortalUser, related_name="filed_grievances", on_delete=models.CASCADE)
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=180)
    description = models.TextField()
    location = models.CharField(max_length=200)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    upvote_count = models.PositiveIntegerField(default=1)
    escalated = models.BooleanField(default=False)
    reopen_count = models.PositiveIntegerField(default=0)
    citizen_rating = models.PositiveSmallIntegerField(null=True, blank=True)
    citizen_feedback = models.CharField(max_length=300, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="new")
    priority = models.CharField(max_length=16, choices=PRIORITY_CHOICES, default="medium")
    assigned_officer = models.ForeignKey(
        PortalUser, null=True, blank=True, related_name="officer_grievances", on_delete=models.SET_NULL
    )
    assigned_worker = models.ForeignKey(
        PortalUser, null=True, blank=True, related_name="worker_grievances", on_delete=models.SET_NULL
    )
    due_date = models.DateField(null=True, blank=True)
    photo_urls = models.JSONField(default=list)
    field_photo_urls = models.JSONField(default=list)
    field_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "grievances"


class GrievanceTimeline(models.Model):
    grievance = models.ForeignKey(Grievance, related_name="timeline", on_delete=models.CASCADE)
    step_key = models.CharField(max_length=40)
    title_ta = models.CharField(max_length=150)
    title_en = models.CharField(max_length=150)
    remarks = models.TextField(blank=True, default="")
    actor_name = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "grievance_timeline"


class GrievanceComment(models.Model):
    grievance = models.ForeignKey(Grievance, related_name="comments", on_delete=models.CASCADE)
    author = models.ForeignKey(PortalUser, on_delete=models.CASCADE)
    author_name = models.CharField(max_length=150)
    author_role = models.CharField(max_length=16)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "grievance_comments"


class GrievanceUpvote(models.Model):
    grievance = models.ForeignKey(Grievance, related_name="upvotes", on_delete=models.CASCADE)
    user = models.ForeignKey(PortalUser, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "grievance_upvotes"
        unique_together = ("grievance", "user")
