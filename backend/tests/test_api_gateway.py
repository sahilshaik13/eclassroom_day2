from app.services.api_gateway_service import classify_route, parse_limit


def test_parse_limit_minute():
    assert parse_limit("100/minute") == (100, 60)


def test_parse_limit_hour():
    assert parse_limit("1000/hour") == (1000, 3600)


def test_parse_limit_invalid_defaults():
    count, window = parse_limit("bad")
    assert count == 100
    assert window == 60


def test_classify_route_auth():
    assert classify_route("/api/v1/auth/login") == "auth"


def test_classify_route_public():
    assert classify_route("/api/v1/public/tenants/demo") == "public"


def test_classify_route_super_admin():
    assert classify_route("/api/v1/super-admin/stats") == "super_admin"


def test_classify_route_gateway_exempt():
    assert classify_route("/api/v1/super-admin/gateway/config") == "exempt"


def test_classify_route_health_exempt():
    assert classify_route("/health") == "exempt"
