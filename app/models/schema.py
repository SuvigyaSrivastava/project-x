"""Our public response schema. LinkedIn's internal shapes never cross this
boundary directly -- app/mapper/profile_mapper.py is the only thing that
sees both sides.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class DateRange(BaseModel):
    start: Optional[str] = None  # "YYYY-MM" or "YYYY"
    end: Optional[str] = None
    is_current: Optional[bool] = None


class Experience(BaseModel):
    title: Optional[str] = None
    company_name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    date_range: Optional[DateRange] = None


class Education(BaseModel):
    school_name: Optional[str] = None
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None


class Skill(BaseModel):
    name: str
    endorsement_count: Optional[int] = None


class Certification(BaseModel):
    name: Optional[str] = None
    authority: Optional[str] = None
    issue_date: Optional[str] = None
    expiration_date: Optional[str] = None
    credential_url: Optional[str] = None


class Language(BaseModel):
    name: Optional[str] = None
    proficiency: Optional[str] = None


class ProfileImage(BaseModel):
    url: Optional[str] = None
    sizes: list[dict] = Field(default_factory=list)


class ProfileResponse(BaseModel):
    public_identifier: str
    profile_url: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    headline: Optional[str] = None
    location: Optional[str] = None
    about: Optional[str] = None
    image: Optional[ProfileImage] = None
    experience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    skills: list[Skill] = Field(default_factory=list)
    certifications: list[Certification] = Field(default_factory=list)
    languages: list[Language] = Field(default_factory=list)
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ApiEnvelope(BaseModel):
    data: ProfileResponse
    warnings: list[str] = Field(default_factory=list)
    cached: bool = False


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str


class ApiErrorResponse(BaseModel):
    error: ApiErrorDetail
