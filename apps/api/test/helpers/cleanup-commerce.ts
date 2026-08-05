import type { PrismaClient } from "@prisma/client";

/** Clears universal commerce/catalog tables (order respects FKs). */
export async function clearCommerceEngine(prisma: PrismaClient) {
  await prisma.offeringTag.deleteMany();
  await prisma.visibilityRule.deleteMany();
  await prisma.availabilityLink.deleteMany();
  await prisma.offeringRelation.deleteMany();
  await prisma.addon.deleteMany();
  await prisma.option.deleteMany();
  await prisma.optionGroup.deleteMany();
  await prisma.modifier.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.packageItem.deleteMany();
  await prisma.serviceDetail.deleteMany();
  await prisma.productDetail.deleteMany();
  await prisma.packageDetail.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.pricingRule.deleteMany();
  await prisma.priceList.deleteMany();
  await prisma.discount.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.taxRule.deleteMany();
  await prisma.offering.deleteMany();
  await prisma.catalogCategory.deleteMany();
  await prisma.catalog.deleteMany();
  await prisma.salesChannel.deleteMany();
  await prisma.currency.deleteMany();
  await prisma.catalogTag.deleteMany();
  await prisma.catalogLabel.deleteMany();
  await prisma.customAttributeDef.deleteMany();
}
