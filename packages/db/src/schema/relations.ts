import { relations } from "drizzle-orm";
import { listingReAttrs, listings, listingVehicleAttrs, media, priceSnapshots } from "./listings";
import { locations, metroStations } from "./locations";
import { modelVersions, valuations } from "./valuations";
import { rawDumps, scrapedListings, scrapeRuns } from "./scraping";
import { organizationMembers, organizations, users } from "./users";
import { payments, plans, subscriptions } from "./billing";

/** Drizzle query API (db.query.listings.findMany({ with: ... })) için ilişki grafı. */

export const usersRelations = relations(users, ({ many }) => ({
  listings: many(listings),
  valuations: many(valuations),
  memberships: many(organizationMembers),
  subscriptions: many(subscriptions),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  listings: many(listings),
  members: many(organizationMembers),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  user: one(users, { fields: [listings.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [listings.organizationId],
    references: [organizations.id],
  }),
  location: one(locations, { fields: [listings.locationId], references: [locations.id] }),
  reAttrs: one(listingReAttrs, {
    fields: [listings.id],
    references: [listingReAttrs.listingId],
  }),
  vehicleAttrs: one(listingVehicleAttrs, {
    fields: [listings.id],
    references: [listingVehicleAttrs.listingId],
  }),
  media: many(media),
  priceSnapshots: many(priceSnapshots),
}));

export const listingReAttrsRelations = relations(listingReAttrs, ({ one }) => ({
  listing: one(listings, { fields: [listingReAttrs.listingId], references: [listings.id] }),
}));

export const listingVehicleAttrsRelations = relations(listingVehicleAttrs, ({ one }) => ({
  listing: one(listings, {
    fields: [listingVehicleAttrs.listingId],
    references: [listings.id],
  }),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  listing: one(listings, { fields: [media.listingId], references: [listings.id] }),
}));

export const priceSnapshotsRelations = relations(priceSnapshots, ({ one }) => ({
  listing: one(listings, { fields: [priceSnapshots.listingId], references: [listings.id] }),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  nearestMetro: one(metroStations, {
    fields: [locations.nearestMetroId],
    references: [metroStations.id],
  }),
  listings: many(listings),
}));

export const valuationsRelations = relations(valuations, ({ one }) => ({
  user: one(users, { fields: [valuations.userId], references: [users.id] }),
  location: one(locations, { fields: [valuations.locationId], references: [locations.id] }),
  modelVersion: one(modelVersions, {
    fields: [valuations.modelVersionId],
    references: [modelVersions.id],
  }),
  convertedListing: one(listings, {
    fields: [valuations.convertedListingId],
    references: [listings.id],
  }),
}));

export const scrapeRunsRelations = relations(scrapeRuns, ({ many }) => ({
  rawDumps: many(rawDumps),
}));

export const rawDumpsRelations = relations(rawDumps, ({ one, many }) => ({
  run: one(scrapeRuns, { fields: [rawDumps.runId], references: [scrapeRuns.id] }),
  scrapedListings: many(scrapedListings),
}));

export const scrapedListingsRelations = relations(scrapedListings, ({ one }) => ({
  rawDump: one(rawDumps, { fields: [scrapedListings.rawDumpId], references: [rawDumps.id] }),
  matchedListing: one(listings, {
    fields: [scrapedListings.matchedListingId],
    references: [listings.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  listing: one(listings, { fields: [payments.listingId], references: [listings.id] }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));
