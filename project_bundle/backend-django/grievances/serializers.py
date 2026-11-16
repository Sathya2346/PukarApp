from rest_framework import serializers
from .models import (
    Category,
    Department,
    Grievance,
    GrievanceComment,
    GrievanceTimeline,
    PortalUser,
)


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = "__all__"


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"


class PortalUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortalUser
        fields = (
            "id", "role", "sub_role", "full_name", "username", "email", "phone",
            "district", "area", "designation", "department", "location", "account_status",
        )


class GrievanceTimelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = GrievanceTimeline
        fields = "__all__"


class GrievanceCommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = GrievanceComment
        fields = "__all__"


class GrievanceSerializer(serializers.ModelSerializer):
    timeline = GrievanceTimelineSerializer(many=True, read_only=True)
    comments = GrievanceCommentSerializer(many=True, read_only=True)

    class Meta:
        model = Grievance
        fields = "__all__"
