from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import migrations, models
import django.db.models.deletion


def link_legacy_profiles(apps, schema_editor):
    app_label, model_name = settings.AUTH_USER_MODEL.split(".")
    User = apps.get_model(app_label, model_name)
    AccessProfile = apps.get_model("works", "AccessProfile")
    database = schema_editor.connection.alias

    for profile in AccessProfile.objects.using(database).order_by("pk").iterator():
        email = (profile.email or "").strip()
        candidates = (
            User.objects.using(database)
            .filter(email__iexact=email)
            .order_by("pk")
            if email
            else User.objects.using(database).none()
        )
        user = next(
            (
                candidate
                for candidate in candidates
                if not AccessProfile.objects.using(database)
                .filter(user_id=candidate.pk)
                .exists()
            ),
            None,
        )

        if user is None:
            username = f"legacy-profile-{profile.pk}"
            suffix = 1
            while User.objects.using(database).filter(username=username).exists():
                suffix += 1
                username = f"legacy-profile-{profile.pk}-{suffix}"
            login_email = email.lower()
            if login_email and User.objects.using(database).filter(
                email__iexact=login_email
            ).exists():
                # Preserve the old address on the profile, but don't create
                # ambiguous email credentials for two separate accounts.
                login_email = ""
            user = User(
                username=username,
                email=login_email,
                first_name=profile.nome[:150],
                is_active=True,
            )
            user.password = make_password(None)
            user.save(using=database)

        profile.user_id = user.pk
        profile.save(using=database, update_fields=["user"])


class Migration(migrations.Migration):
    dependencies = [
        ("works", "0002_accessprofile_auditevent"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameField(
            model_name="accessprofile",
            old_name="clerk_user_id",
            new_name="legacy_auth_id",
        ),
        migrations.AlterField(
            model_name="accessprofile",
            name="legacy_auth_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AlterModelOptions(
            name="accessprofile",
            options={
                "ordering": ["nome", "legacy_auth_id"],
                "verbose_name": "Perfil de acesso",
                "verbose_name_plural": "Perfis de acesso",
            },
        ),
        migrations.AddField(
            model_name="accessprofile",
            name="user",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="access_profile",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(link_legacy_profiles, migrations.RunPython.noop),
    ]