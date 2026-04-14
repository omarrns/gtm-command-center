-- Track opportunities the user applied to outside the system (direct application)
alter table opportunities
  add column applied_manually boolean not null default false;
