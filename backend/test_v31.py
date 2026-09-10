"""V3.1 Smoke tests — verify core API endpoints"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

def test_imports():
    """1. All modules import cleanly"""
    from routers.photos import router, compare_router, recycle_router
    from agent.tools import ALL_TOOL_DEFINITIONS, _photo_to_agent_dict
    from agent.orchestrator import AgentOrchestrator
    from models.photo import Photo
    from db import init_db
    print("[OK] Module imports")

def test_db():
    """2. Database init + migrations"""
    from db import init_db
    init_db()
    print("[OK] Database init")

def test_tool_count():
    """3. Agent tool count (expect 8)"""
    from agent.tools import ALL_TOOL_DEFINITIONS
    names = [t["name"] for t in ALL_TOOL_DEFINITIONS]
    assert len(names) == 8, f"Expected 8 tools, got {len(names)}"
    expected = ["list_projects", "scan_similar_groups", "get_photo_detail",
                "compare_two_photos", "suggest_cleanup_plan", "execute_cleanup",
                "restore_photos", "search_photos"]
    for e in expected:
        assert e in names, f"Missing tool: {e}"
    print(f"[OK] Tool count: {len(names)} — {names}")

def test_photo_model():
    """4. Photo model has soft-delete columns"""
    from models.photo import Photo
    cols = {c.name for c in Photo.__table__.columns}
    assert "deleted_at" in cols, "Missing deleted_at column"
    assert "deleted_by" in cols, "Missing deleted_by column"
    print("[OK] Photo model: deleted_at, deleted_by")

def test_thumbnail_route():
    """5. Thumbnail route registered"""
    from main import app
    paths = set(app.openapi()["paths"].keys())
    assert "/api/projects/photos/{photo_id}/file" in paths
    print("[OK] Thumbnail route: GET /api/projects/photos/{photo_id}/file")

def test_recycle_routes():
    """6. Recycle bin routes registered"""
    from main import app
    paths = set(app.openapi()["paths"].keys())
    for p in ["/api/photos/recycle-bin", "/api/photos/restore",
              "/api/photos/purge-expired"]:
        assert p in paths, f"Missing route: {p}"
    print("[OK] Recycle routes: /api/photos/recycle-bin, /restore, /purge-expired")

def test_agent_to_dict():
    """7. _photo_to_agent_dict includes thumbnail_url"""
    from agent.tools import _photo_to_agent_dict

    class MockPhoto:
        id = "test-123"
        original_name = "IMG_001.jpg"
        file_size = 1048576
        mime_type = "image/jpeg"
        resolution_w = 1920
        resolution_h = 1080
        exif_datetime_original = "2024-01-15T10:30:00"
        exif_make = "Apple"
        exif_model = "iPhone 15"
        exif_has_all = True
        quality_status = "ok"
        quality_reason = None
        ai_score_sharpness = 7.5
        ai_score_aesthetic = 6.0
        ai_score_overall = 7.0
        source_type = "manual"
        cleanup_status = "keep"
        cleanup_group_id = None
        cleanup_group_rank = None
        cleanup_reason = None

    result = _photo_to_agent_dict(MockPhoto())
    assert "thumbnail_url" in result, "Missing thumbnail_url"
    assert "file_url" in result, "Missing file_url"
    assert "size=200" in result["thumbnail_url"], "thumbnail_url missing size param"
    assert "source_type_label" in result, "Missing source_type_label"
    print("[OK] _photo_to_agent_dict: thumbnail_url, file_url, source_type_label")

if __name__ == "__main__":
    print("=" * 50)
    print("V3.1 Smoke Tests")
    print("=" * 50)

    tests = [
        test_imports, test_db, test_tool_count, test_photo_model,
        test_thumbnail_route, test_recycle_routes, test_agent_to_dict,
    ]

    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"[FAIL] {t.__name__}: {e}")
            failed += 1

    print("=" * 50)
    print(f"Result: {passed} passed, {failed} failed")
    print("=" * 50)
    sys.exit(0 if failed == 0 else 1)
