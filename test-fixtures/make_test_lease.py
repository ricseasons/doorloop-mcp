import argparse
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

ap = argparse.ArgumentParser(description="Build the fake test lease used to exercise the lease onboarding skill.")
ap.add_argument("out")
ap.add_argument("--landlord", default="ABC Properties")
ap.add_argument("--tenant", default="API Test Tenant")
ap.add_argument("--email", default="api.test.tenant@example.com")
ap.add_argument("--phone", default="(202) 555-0143")
a = ap.parse_args()
out = a.out
ss = getSampleStyleSheet()
body = ParagraphStyle("b", parent=ss["Normal"], fontName="Times-Roman", fontSize=11, leading=14, spaceAfter=4)
head = ParagraphStyle("h", parent=body, fontName="Times-Bold", spaceBefore=6, spaceAfter=2, keepWithNext=1)
ind = ParagraphStyle("i", parent=body, leftIndent=18)
title = ParagraphStyle("t", parent=body, fontName="Times-Bold", fontSize=14, alignment=1, spaceAfter=2)
sub = ParagraphStyle("s", parent=body, fontSize=8, alignment=1, spaceAfter=12)

def b(s): return f"<b>{s}</b>"
S = []
S += [Paragraph("RESIDENTIAL RENTAL AGREEMENT", title), Paragraph("(Test document for DoorLoop lease onboarding. Not a real lease.)", sub)]
S.append(Paragraph(
  f"THIS AGREEMENT made this {b('21st')} Day of {b('October, 2026')}, by and between {b(a.landlord)}, herein called "
  f"“Landlord,” and {b(a.tenant)}, herein called “Tenant” (email {b(a.email)}, phone {b(a.phone)}). Landlord hereby agrees to rent to Tenant the dwelling "
  f"located at {b('7307 Reservation Drive, Apt 2, Springfield, VA 22153')} under the following terms and conditions.", body))
sections = [
 ("FIXED-TERM AGREEMENT (LEASE):", f"Tenants agree to lease this dwelling for a fixed term of {b('one year')}, beginning {b('November 1, 2026')} and ending {b('October 31, 2027')}. Upon expiration, this Agreement shall become a month-to-month agreement AUTOMATICALLY, UNLESS either Tenants or Owners notify the other party in writing at least 30 days prior to expiration that they do not wish this Agreement to continue on any basis."),
 ("RENT:", f"Tenant agrees to pay Landlord as base rent the sum of {b('$1,300')} per month, due and payable monthly in advance on the {b('1st')} day of each month during the term of this agreement. The first month’s rent is required to be submitted on or before move-in."),
 ("FORM OF PAYMENT:", "Tenants agree to pay their rent in the form of a personal check, a cashier’s check, or a money order made out to the Landlord."),
 ("RENT PAYMENT PROCEDURE:", "Tenants agree to pay their rent by mail addressed to the Landlord at 426 Main Street, Anycity, USA, or in person at the same address, or in such other way as the Landlord will advise the Tenant in writing."),
 ("RENT DUE DATE:", f"Tenant hereby acknowledges that late payment will cause Landlord to incur costs not contemplated by this Rental Agreement. We allow for a 3 day grace period. In the event rent is not received prior to the 4th of the month, Tenant agrees to pay a {b('$25')} late fee, plus an additional $5 per day for every day thereafter until the rent is paid."),
 ("BAD-CHECK SERVICING CHARGE:", "In the event Tenant’s check is dishonored and returned unpaid for any reason to Landlord, Tenant agrees to pay a returned check charge of $25 AND accept whatever consequences there might be in making a late payment."),
 ("SECURITY DEPOSIT:", f"Tenants hereby agree to pay a security deposit of {b('$1,300')} to be refunded upon vacating, returning the keys to the Landlord and termination of this contract according to other terms herein agreed. This deposit will be held to cover any possible damage to the property. No interest will be paid on this money and in no case will it be applied to back or future rent. Deposit money minus any necessary charges will be returned to Tenant with a written explanation of deductions within 60 days after they have vacated the property."),
 ("CLEANING FEE:", "Tenant hereby agrees to accept property in its present state of cleanliness. They agree to return the property in the same condition or pay a $200.00 minimum cleaning fee if the Landlord has to have the property professionally cleaned."),
 ("VEHICLES & GARAGE USE:", f"Tenants agree to keep a maximum of {b('1')} vehicle on premises. Vehicles must be operable and currently licensed and parked in assigned spaces."),
 ("UTILITIES:", "Resident will be responsible for payment of all utilities, telephone, gas, or other bills incurred during their residency. The Landlord/Owner agrees to only pay water, garbage, and sewer bills."),
 ("NOTIFICATION OF SERIOUS BUILDING PROBLEMS:", "Tenant agrees to notify Landlord immediately if roof leaks, water spots appear on ceiling, or at the first sign of termite activity or other serious building problems."),
 ("PETS:", f"Pets are allowed on the premises only by obtaining the Landlords’ written permission first. When permission is granted, Tenant is required to pay an additional {b('$25')} per month pet-rent charge for one or more pets. Service animals are not pets."),
 ("FULL DISCLOSURE:", "The Tenants signing this Rental Contract hereby state that all questions about this Rental Agreement have been answered and that they fully understand all the provisions of the agreement."),
]
for i,(h,t) in enumerate(sections,1):
    S.append(Paragraph(f"{i}. {h}", head)); S.append(Paragraph(t, ind))
S.append(Spacer(1,10))
S.append(Paragraph(f"Accepted this {b('21st')} day of {b('October')}, 20{b('26')}.", body))
S.append(Spacer(1,24))
S.append(Paragraph(f"<u>&nbsp;&nbsp;{b(a.tenant)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>&nbsp;&nbsp;&nbsp;&nbsp;<u>&nbsp;10/21/2026&nbsp;</u><br/>Tenant&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date", body))
S.append(Spacer(1,18))
S.append(Paragraph(f"<u>&nbsp;&nbsp;{b(a.landlord)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>&nbsp;&nbsp;&nbsp;&nbsp;<u>&nbsp;10/21/2026&nbsp;</u><br/>Landlord-Manager&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date", body))
S.append(Spacer(1,12))
S.append(Paragraph("Adapted from the FTC sample rental agreement (Consumer.gov teacher resources).", sub))
SimpleDocTemplate(out, pagesize=letter, leftMargin=inch, rightMargin=inch, topMargin=0.8*inch, bottomMargin=0.8*inch, title="Test lease - 7307 Reservation Drive Apt 2").build(S)
