"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const consentSchema = z
  .object({
    subjectName: z.string().optional(),
    subjectEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
    subjectPhone: z.string().optional(),
    consentGiven: z.boolean().refine((v) => v, {
      message: "You must consent to the recording and age-range analysis.",
    }),
    adultDeclaration: z.boolean().refine((v) => v, {
      message: "You must confirm you are 18 or older.",
    }),
    acknowledgeApproximate: z.boolean().refine((v) => v, {
      message: "You must acknowledge that results are approximate.",
    }),
  })
  .superRefine((data, ctx) => {
    if (data.subjectEmail && data.subjectEmail.length > 0 && !z.string().email().safeParse(data.subjectEmail).success) {
      ctx.addIssue({
        code: "custom",
        path: ["subjectEmail"],
        message: "Enter a valid email",
      });
    }
  });

export type ConsentValues = z.infer<typeof consentSchema>;

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
    watch,
    formState: { errors },
  } = useForm<ConsentValues>({
    resolver: zodResolver(consentSchema),
    defaultValues: {
      consentGiven: false,
      adultDeclaration: false,
      acknowledgeApproximate: false,
    },
  });

  // react-hooks/incompatible-library: RHF's watch() is the documented pattern
  // for reading form values; the compiler warning is a known false positive.
  // eslint-disable-next-line react-hooks/incompatible-library
  const watched = watch();

  const toggle = (name: keyof ConsentValues) => (checked: boolean) => {
    setValue(name, checked as never);
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Before you start</CardTitle>
        <CardDescription>
          We will record a short video selfie and estimate an approximate age range. Read the
          privacy notice below before continuing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => onConsent(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="subjectName">Name (optional)</Label>
            <Input id="subjectName" placeholder="Your name" {...register("subjectName")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="subjectEmail">Email (optional)</Label>
            <Input id="subjectEmail" type="email" placeholder="you@example.com" {...register("subjectEmail")} />
            {errors.subjectEmail && (
              <p className="text-sm text-red-600">{errors.subjectEmail.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="subjectPhone">Phone (optional)</Label>
            <Input id="subjectPhone" type="tel" placeholder="+91…" {...register("subjectPhone")} />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="consentGiven"
              checked={watched.consentGiven}
              onCheckedChange={toggle("consentGiven")}
            />
            <Label htmlFor="consentGiven" className="font-normal leading-snug">
              I consent to a short video selfie being recorded and analyzed for an estimated age
              range.
            </Label>
          </div>
          {errors.consentGiven && <p className="text-sm text-red-600">{errors.consentGiven.message}</p>}

          <div className="flex items-start gap-2">
            <Checkbox
              id="adultDeclaration"
              checked={watched.adultDeclaration}
              onCheckedChange={toggle("adultDeclaration")}
            />
            <Label htmlFor="adultDeclaration" className="font-normal leading-snug">
              I confirm I am 18 or older.
            </Label>
          </div>
          {errors.adultDeclaration && (
            <p className="text-sm text-red-600">{errors.adultDeclaration.message}</p>
          )}

          <div className="flex items-start gap-2">
            <Checkbox
              id="acknowledgeApproximate"
              checked={watched.acknowledgeApproximate}
              onCheckedChange={toggle("acknowledgeApproximate")}
            />
            <Label htmlFor="acknowledgeApproximate" className="font-normal leading-snug">
              I acknowledge the age estimate is approximate and may be inaccurate.
            </Label>
          </div>
          {errors.acknowledgeApproximate && (
            <p className="text-sm text-red-600">{errors.acknowledgeApproximate.message}</p>
          )}

          <Button type="submit" disabled={busy}>
            Start face scan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
