"use client";


import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { saveFormState, getFormState } from "@/lib/storage/scan-storage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const consentSchema = z.object({
  subjectName: z.string().min(1, "Name is required"),
  subjectEmail: z.string().min(1, "Email is required").email("Enter a valid email address"),
  subjectPhone: z.string().min(1, "Phone number is required"),
  consentGiven: z.boolean().refine((v) => v, {
    message: "You must consent to the recording and age-range analysis.",
  }),
  adultDeclaration: z.boolean().refine((v) => v, {
    message: "You must confirm you are 18 or older.",
  }),
  acknowledgeApproximate: z.boolean().refine((v) => v, {
    message: "You must acknowledge that results are approximate.",
  }),
});

export type ConsentValues = z.infer<typeof consentSchema>;

function getSavedDefaultValues(): ConsentValues {
  const saved = getFormState();
  return {
    subjectName: saved.subjectName ?? "",
    subjectEmail: saved.subjectEmail ?? "",
    subjectPhone: saved.subjectPhone ?? "",
    consentGiven: false,
    adultDeclaration: false,
    acknowledgeApproximate: false,
  };
}

export function ConsentForm({
  onConsent,
  busy,
}: {
  onConsent: (values: ConsentValues) => void;
  busy?: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<ConsentValues>({
    resolver: zodResolver(consentSchema),
    defaultValues: getSavedDefaultValues(),
  });

  const consentGiven = useWatch({ control, name: "consentGiven" });
  const adultDeclaration = useWatch({ control, name: "adultDeclaration" });
  const acknowledgeApproximate = useWatch({ control, name: "acknowledgeApproximate" });

  const toggle = (name: keyof ConsentValues) => (checked: boolean) => {
    setValue(name, checked as never);
  };

  return (
    <Card className="hud-panel w-full max-w-lg rounded-3xl">
      <CardHeader>
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-cyan-300/80">
          Mission briefing
        </p>
        <CardTitle className="text-2xl">Before you start</CardTitle>
        <CardDescription>
          You will record three short clips — looking straight ahead, then left, then right. They
          are used to estimate an approximate age band and a cosmetic skin-age reading. Skin scoring
          sends your captured frames to an external AI provider for analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-950/40 p-3.5 flex items-start gap-3">
          <span className="text-xl">👓</span>
          <div className="text-xs leading-relaxed text-amber-200/90">
            <strong className="block text-amber-300 font-semibold mb-0.5">Please remove your glasses</strong>
            For accurate skin scoring and face calibration, please remove any glasses, sunglasses, or face coverings before starting the scan.
          </div>
        </div>

        <form
          onSubmit={handleSubmit((values) => {
            saveFormState({
              subjectName: values.subjectName,
              subjectEmail: values.subjectEmail,
              subjectPhone: values.subjectPhone,
            });
            onConsent(values);
          })}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="subjectName">Name *</Label>
            <Input id="subjectName" placeholder="Your name" {...register("subjectName")} />
            {errors.subjectName && (
              <p className="text-sm text-rose-400">{errors.subjectName.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="subjectEmail">Email *</Label>
            <Input id="subjectEmail" type="email" placeholder="you@example.com" {...register("subjectEmail")} />
            {errors.subjectEmail && (
              <p className="text-sm text-rose-400">{errors.subjectEmail.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="subjectPhone">Phone *</Label>
            <Input id="subjectPhone" type="tel" placeholder="+91…" {...register("subjectPhone")} />
            {errors.subjectPhone && (
              <p className="text-sm text-rose-400">{errors.subjectPhone.message}</p>
            )}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="consentGiven"
              checked={Boolean(consentGiven)}
              onCheckedChange={toggle("consentGiven")}
            />
            <Label htmlFor="consentGiven" className="font-normal leading-snug">
              I consent to three short video clips being recorded and analyzed for an estimated age
              range and a cosmetic skin-age reading.
            </Label>
          </div>
          {errors.consentGiven && <p className="text-sm text-rose-400">{errors.consentGiven.message}</p>}

          <div className="flex items-start gap-2">
            <Checkbox
              id="adultDeclaration"
              checked={Boolean(adultDeclaration)}
              onCheckedChange={toggle("adultDeclaration")}
            />
            <Label htmlFor="adultDeclaration" className="font-normal leading-snug">
              I confirm I am 18 or older.
            </Label>
          </div>
          {errors.adultDeclaration && (
            <p className="text-sm text-rose-400">{errors.adultDeclaration.message}</p>
          )}

          <div className="flex items-start gap-2">
            <Checkbox
              id="acknowledgeApproximate"
              checked={Boolean(acknowledgeApproximate)}
              onCheckedChange={toggle("acknowledgeApproximate")}
            />
            <Label htmlFor="acknowledgeApproximate" className="font-normal leading-snug">
              I acknowledge the results are approximate, are for fun, and are not medical advice or
              proof of age.
            </Label>
          </div>
          {errors.acknowledgeApproximate && (
            <p className="text-sm text-rose-400">{errors.acknowledgeApproximate.message}</p>
          )}

          <Button type="submit" disabled={busy} className="mt-2 h-12 rounded-full font-bold">
            {busy ? "Starting…" : "Start face scan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
