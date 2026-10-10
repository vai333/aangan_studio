-- HubSpot portals live on regional UI hosts (e.g. app-na2.hubspot.com); deep links must use the right one.
alter table hubspot_syncs add column ui_domain text;
