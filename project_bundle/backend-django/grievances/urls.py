from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryViewSet,
    ChangePasswordView,
    DepartmentViewSet,
    GrievanceViewSet,
    LoginEmailOtpView,
    RunSlaSweepView,
    VerifyEmailOtpView,
)

router = DefaultRouter()
router.register("grievances", GrievanceViewSet, basename="grievances")
router.register("categories", CategoryViewSet, basename="categories")
router.register("departments", DepartmentViewSet, basename="departments")

urlpatterns = [
    path("auth/login/", LoginEmailOtpView.as_view(), name="auth-login"),
    path("auth/verify-otp/", VerifyEmailOtpView.as_view(), name="auth-verify-otp"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("admin/run-sla-check/", RunSlaSweepView.as_view(), name="admin-run-sla"),
    path("", include(router.urls)),
]
