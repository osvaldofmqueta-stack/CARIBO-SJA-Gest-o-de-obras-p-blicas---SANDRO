import json

from rest_framework.renderers import JSONRenderer

from .models import AuditEvent


def snapshot(serializer) -> dict:
    return json.loads(JSONRenderer().render(serializer.data))


def record_audit(request, *, entity_type, object_id, action, before=None, after=None):
    profile = getattr(request.user, "access_profile", None)
    if not request.user.is_authenticated:
        return
    actor_id = request.user.email or str(request.user.pk)
    AuditEvent.objects.create(
        entity_type=entity_type,
        object_id=str(object_id),
        action=action,
        actor_identifier=str(actor_id),
        actor_role=profile.role if profile else "",
        details={"before": before, "after": after},
    )