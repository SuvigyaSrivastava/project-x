import pytest

from app.utils.url_parser import InvalidUrlError, extract_public_identifier


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://www.linkedin.com/in/jane-doe/", "jane-doe"),
        ("https://linkedin.com/in/jane-doe", "jane-doe"),
        ("linkedin.com/in/jane-doe/", "jane-doe"),
        ("https://in.linkedin.com/in/jane-doe", "jane-doe"),
        ("https://www.linkedin.com/in/jane-doe/?originalSubdomain=in", "jane-doe"),
        ("https://www.linkedin.com/in/jane-doe/details/experience/", "jane-doe"),
        ("jane-doe", "jane-doe"),
        ("jane_doe-123", "jane_doe-123"),
    ],
)
def test_valid_urls(url, expected):
    assert extract_public_identifier(url) == expected


@pytest.mark.parametrize(
    "url",
    [
        "",
        None,
        "https://twitter.com/jane-doe",
        "https://www.linkedin.com/company/example-corp/",
        "https://www.linkedin.com/in/",
        "https://evil.com/linkedin.com/in/jane-doe",
        "https://www.linkedin.com:8443/in/jane-doe",
        "https://user:pass@www.linkedin.com/in/jane-doe",
        "https://www.linkedin.com/in/../../etc/passwd",
        "https://www.linkedin.com/in/jane%2f..%2fdoe",
    ],
)
def test_invalid_urls_rejected(url):
    with pytest.raises(InvalidUrlError):
        extract_public_identifier(url)
