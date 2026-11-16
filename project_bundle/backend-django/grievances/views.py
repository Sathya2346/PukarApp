import math
from datetime import timedelta
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import (
    Category,
    Department,
    EmailOtpToken,
    Grievance,
    GrievanceComment,
    GrievanceTimeline,
    GrievanceUpvote,
    PortalUser,
)
from .otp_service import dispatch_email_otp
from .serializers import CategorySerializer, DepartmentSerializer, GrievanceSerializer, PortalUserSerializer


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius = 6371000.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * earth_radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class LoginEmailOtpView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        identifier = request.data.get("identifier", "").strip().lower()
        password = request.data.get("password", "")
        role = request.data.get("role", "citizen")
        user = PortalUser.objects.filter(email__iexact=identifier, role=role).first()
        if not user or not user.check_password(password):
            return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)
        if user.account_status != "active":
            return Response({"error": f"Account status is {user.account_status}"}, status=status.HTTP_403_FORBIDDEN)
        dispatch_email_otp(user.email, role, "login")
        return Response({"otp_required": True, "email": user.email, "role": role})


class VerifyEmailOtpView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        role = request.data.get("role", "citizen")
        code = request.data.get("code", "").strip()
        otp = EmailOtpToken.objects.filter(email=email, role=role, consumed=False).order_by("-id").first()
        if not otp or otp.attempts >= 5 or timezone.now() > otp.expires_at:
            return Response({"error": "OTP expired or locked"}, status=status.HTTP_400_BAD_REQUEST)
        if otp.code != code:
            otp.attempts += 1
            otp.save()
            return Response({"error": "Incorrect OTP"}, status=status.HTTP_400_BAD_REQUEST)
        otp.consumed = True
        otp.save()
        user = PortalUser.objects.get(email__iexact=email, role=role)
        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": PortalUserSerializer(user).data,
        })


class ChangePasswordView(APIView):
    def post(self, request):
        current_password = request.data.get("current_password", "")
        new_password = request.data.get("new_password", "")
        if not request.user.check_password(current_password) or len(new_password) < 6:
            return Response({"error": "Invalid current password or short new password"}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(new_password)
        request.user.save()
        return Response({"success": True})


class GrievanceViewSet(viewsets.ModelViewSet):
    serializer_class = GrievanceSerializer

    def get_queryset(self):
        user = self.request.user
        scope_all = self.request.query_params.get("scope") == "all"
        if user.role == "citizen":
            return Grievance.objects.filter(citizen=user).order_by("-id")
        if user.role == "officer" and not scope_all:
            if user.sub_role == "field_worker":
                return Grievance.objects.filter(assigned_worker=user).order_by("-id")
            if user.department_id:
                return Grievance.objects.filter(
                    Q(department_id=user.department_id) | Q(assigned_officer=user) | Q(assigned_worker=user)
                ).order_by("-id")
        return Grievance.objects.all().order_by("-id")

    def perform_create(self, serializer):
        category = Category.objects.get(pk=self.request.data.get("category"))
        due_date = timezone.localdate() + timedelta(days=category.sla_days or 5)
        dept_id = min(category.id, 6)
        officer = (
            PortalUser.objects.filter(role="officer", sub_role="officer", account_status="active", department_id=dept_id)
            .annotate(open_load=Count("officer_grievances", filter=~Q(officer_grievances__status="resolved")))
            .order_by("open_load", "id")
            .first()
        )
        grievance = serializer.save(
            citizen=self.request.user,
            department_id=dept_id,
            due_date=due_date,
            assigned_officer=officer,
            status="assigned" if officer else "new",
        )
        GrievanceTimeline.objects.create(
            grievance=grievance,
            step_key="submitted",
            title_ta="புகார் பதிவு செய்யப்பட்டது",
            title_en="Grievance Submitted",
            remarks=grievance.description[:120],
            actor_name=self.request.user.full_name,
        )

    @action(detail=False, methods=["get"])
    def nearby(self, request):
        try:
            lat = float(request.query_params.get("lat"))
            lng = float(request.query_params.get("lng"))
            cat_id = int(request.query_params.get("categoryId"))
        except (TypeError, ValueError):
            return Response({"duplicate": None})
        candidates = Grievance.objects.filter(category_id=cat_id).exclude(status="resolved").exclude(latitude__isnull=True)
        for cand in candidates:
            if haversine_meters(lat, lng, float(cand.latitude), float(cand.longitude)) <= 150.0:
                return Response({"duplicate": GrievanceSerializer(cand).data})
        return Response({"duplicate": None})

    @action(detail=True, methods=["post"])
    def upvote(self, request, pk=None):
        grievance = self.get_object()
        _, created = GrievanceUpvote.objects.get_or_create(grievance=grievance, user=request.user)
        if created:
            grievance.upvote_count += 1
            grievance.save(update_fields=["upvote_count"])
        return Response({"upvote_count": grievance.upvote_count})

    @action(detail=True, methods=["post"])
    def comments(self, request, pk=None):
        grievance = self.get_object()
        message = str(request.data.get("message", "")).strip()
        if len(message) < 2:
            return Response({"error": "Message too short"}, status=status.HTTP_400_BAD_REQUEST)
        GrievanceComment.objects.create(
            grievance=grievance,
            author=request.user,
            author_name=request.user.full_name,
            author_role=request.user.role,
            message=message[:400],
        )
        return Response({"success": True}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        grievance = self.get_object()
        if grievance.status != "resolved" or grievance.reopen_count >= 3:
            return Response({"error": "Cannot reopen grievance"}, status=status.HTTP_400_BAD_REQUEST)
        reason = str(request.data.get("reason", "")).strip()
        if len(reason) < 5:
            return Response({"error": "Reason min 5 chars required"}, status=status.HTTP_400_BAD_REQUEST)
        grievance.status = "in_progress"
        grievance.reopen_count += 1
        grievance.save(update_fields=["status", "reopen_count", "updated_at"])
        GrievanceTimeline.objects.create(
            grievance=grievance,
            step_key="reopened",
            title_ta="புகார் மீண்டும் திறக்கப்பட்டது",
            title_en="Reopened by Citizen",
            remarks=reason,
            actor_name=request.user.full_name,
        )
        return Response({"success": True})

    @action(detail=True, methods=["post"])
    def rate(self, request, pk=None):
        grievance = self.get_object()
        rating = int(request.data.get("rating", 0))
        if grievance.status != "resolved" or not (1 <= rating <= 5):
            return Response({"error": "Invalid rating or status"}, status=status.HTTP_400_BAD_REQUEST)
        grievance.citizen_rating = rating
        grievance.citizen_feedback = str(request.data.get("feedback", ""))[:300]
        grievance.save(update_fields=["citizen_rating", "citizen_feedback"])
        return Response({"success": True})

    @action(detail=True, methods=["patch"])
    def update_status(self, request, pk=None):
        if request.user.role not in ("officer", "admin"):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        grievance = self.get_object()
        next_status = request.data.get("status")
        remarks = str(request.data.get("remarks", "")).strip()
        photos = request.data.get("field_photo_urls", grievance.field_photo_urls)
        if next_status == "resolved" and (not photos or len(remarks) < 10):
            return Response(
                {"error": "Proof photo and >=10 char remarks required to resolve"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        grievance.status = next_status
        grievance.field_photo_urls = photos
        grievance.field_notes = remarks or grievance.field_notes
        if next_status == "resolved":
            grievance.escalated = False
        grievance.save()
        GrievanceTimeline.objects.create(
            grievance=grievance,
            step_key=next_status,
            title_ta=next_status,
            title_en=next_status.replace("_", " ").title(),
            remarks=remarks,
            actor_name=request.user.full_name,
        )
        return Response(GrievanceSerializer(grievance).data)


class RunSlaSweepView(APIView):
    def post(self, request):
        if request.user.role != "admin":
            return Response({"error": "Admin required"}, status=status.HTTP_403_FORBIDDEN)
        today = timezone.localdate()
        breached = Grievance.objects.filter(due_date__lt=today).exclude(status__in=("resolved", "overdue"))
        count = breached.update(status="overdue", escalated=True)
        return Response({"escalated_count": count})


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
